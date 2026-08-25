import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readCredentials } from "../integrations/auvo/auvo.provider.ts";
import { listCustomersPageRaw, listEquipmentsPageRaw } from "../integrations/auvo/auvo.assetsClient.ts";
import { normalizeAuvoCustomer, normalizeAuvoEquipment } from "../integrations/auvo/auvo.assetsNormalizer.ts";
import { AUVO_CONCURRENCY_LIMIT, AUVO_MAX_PAGE_SIZE, getAuvoAssetsSyncTtlSeconds } from "../integrations/auvo/auvo.config.ts";
import { mapWithConcurrency } from "../shared/concurrency.ts";
import { logEvent } from "../shared/logger.ts";

const CACHE_KEY = "auvo_assets_sync";
// Sync completo (~9 páginas de clientes + ~16 de equipamentos, concorrência
// 8) leva bem mais que os 20s de CLAIM_TTL_SECONDS usados pro token —
// generoso de propósito pra não deixar uma 2ª aba destravar o lock e
// disparar um sync duplicado enquanto o 1º ainda está em andamento.
const CLAIM_TTL_SECONDS = 180;

export interface AssetsSyncMeta {
  syncStartedAt: string | null;
  syncFinishedAt: string | null;
  status: "ok" | "error" | null;
  customersCount: number;
  equipmentsCount: number;
  error: string | null;
}

const EMPTY_META: AssetsSyncMeta = {
  syncStartedAt: null,
  syncFinishedAt: null,
  status: null,
  customersCount: 0,
  equipmentsCount: 0,
  error: null,
};

interface CacheRow {
  generated_at: string | null;
  payload: AssetsSyncMeta | null;
}

async function readCacheRow(db: SupabaseClient): Promise<CacheRow | null> {
  const { data } = await db
    .from("operational_snapshot_cache")
    .select("generated_at, payload")
    .eq("cache_key", CACHE_KEY)
    .maybeSingle();
  return data ?? null;
}

// Busca todas as páginas de um endpoint (customers OU equipments): a 1ª
// página sozinha revela o total, o resto é buscado em paralelo (limite
// AUVO_CONCURRENCY_LIMIT, mesma razão de tasks — ver auvo.config.ts) em vez
// de 1 página por vez.
async function fetchAllPages(
  lister: (page: number, pageSize: number) => Promise<{ entityList: Record<string, unknown>[]; totalItems: number }>
): Promise<Record<string, unknown>[]> {
  const pageSize = AUVO_MAX_PAGE_SIZE;
  const first = await lister(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(first.totalItems / pageSize));
  if (totalPages <= 1) return first.entityList;

  const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  const rest = await mapWithConcurrency(remainingPages, AUVO_CONCURRENCY_LIMIT, (page) => lister(page, pageSize));

  return [first.entityList, ...rest.map((r) => r.entityList)].flat();
}

// on conflict (auvo_id) do update: idempotente, roda de novo sem duplicar.
// Em lotes (não 1 request por linha) — volume atual (~850 clientes, ~1550
// equipamentos) cabe tranquilo num único upsert cada, mas chunka mesmo
// assim pra não depender de nunca crescer.
const UPSERT_CHUNK_SIZE = 500;

async function upsertInChunks(db: SupabaseClient, table: string, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await db.from(table).upsert(chunk, { onConflict: "auvo_id" });
    if (error) throw new Error(`Falha ao salvar ${table}: ${error.message}`);
  }
}

async function runSync(db: SupabaseClient): Promise<AssetsSyncMeta> {
  const startedAt = new Date().toISOString();
  const creds = readCredentials();

  // As duas listagens não dependem uma da outra — buscar em paralelo evita
  // pagar a latência de uma depois da outra (mesma lógica do Promise.allSettled
  // em vmpayService.ts).
  const [customersRaw, equipmentsRaw] = await Promise.all([
    fetchAllPages((page, pageSize) => listCustomersPageRaw(db, creds, page, pageSize)),
    fetchAllPages((page, pageSize) => listEquipmentsPageRaw(db, creds, page, pageSize)),
  ]);

  const customers = customersRaw.map(normalizeAuvoCustomer);
  const equipments = equipmentsRaw.map(normalizeAuvoEquipment);
  const syncedAt = new Date().toISOString();

  await upsertInChunks(
    db,
    "auvo_customers",
    customers.map((c) => ({
      auvo_id: c.auvoId,
      description: c.description,
      legal_name: c.legalName,
      cpf_cnpj: c.cpfCnpj,
      external_id: c.externalId,
      address: c.address,
      address_complement: c.addressComplement,
      city: c.city,
      state: c.state,
      latitude: c.latitude,
      longitude: c.longitude,
      active: c.active,
      segment_id: c.segmentId,
      creation_date: c.creationDate,
      date_last_update: c.dateLastUpdate,
      raw_data: c.rawData,
      synced_at: syncedAt,
    }))
  );

  // Equipamentos depois de clientes, na mesma execução — associated_customer_id
  // aponta para auvo_customers.auvo_id só por convenção de leitura (join na
  // view), sem FK (seção "sem foreign key" do schema), então a ordem aqui não
  // é estritamente necessária, mas mantém a leitura consistente caso alguém
  // rode /overview no meio do sync.
  await upsertInChunks(
    db,
    "auvo_equipments",
    equipments.map((e) => ({
      auvo_id: e.auvoId,
      associated_customer_id: e.associatedCustomerId,
      parent_equipment_id: e.parentEquipmentId,
      associated_user_id: e.associatedUserId,
      category_id: e.categoryId,
      name: e.name,
      identifier: e.identifier,
      active: e.active,
      creation_date: e.creationDate,
      expiration_date: e.expirationDate,
      warranty_start_date: e.warrantyStartDate,
      warranty_end_date: e.warrantyEndDate,
      description: e.description,
      url_image: e.urlImage,
      equipment_specifications: e.equipmentSpecifications,
      raw_data: e.rawData,
      synced_at: syncedAt,
    }))
  );

  await logEvent(db, "auvo", "AUVO_ASSETS_SYNC_SUCCESS", {
    customersCount: customers.length,
    equipmentsCount: equipments.length,
  });

  return {
    syncStartedAt: startedAt,
    syncFinishedAt: new Date().toISOString(),
    status: "ok",
    customersCount: customers.length,
    equipmentsCount: equipments.length,
    error: null,
  };
}

// Mesmo padrão de single-flight de getMachineMonitorSnapshot (vmpayService.ts):
// só quem ganha o claim sincroniza; quem não ganha não espera, só segue e lê o
// que já está no Postgres — nunca trava a tela esperando outra aba terminar.
// Falha no sync NUNCA apaga auvo_customers/auvo_equipments — o dado antigo
// continua servindo até o próximo sync dar certo (seção 42/44 do pedido).
export async function ensureFreshAssetsSnapshot(
  db: SupabaseClient,
  { force = false }: { force?: boolean } = {}
): Promise<AssetsSyncMeta> {
  const cached = await readCacheRow(db);
  const ttlMs = getAuvoAssetsSyncTtlSeconds() * 1000;
  const isFresh = Boolean(cached?.generated_at && Date.now() - new Date(cached.generated_at).getTime() < ttlMs);

  if (isFresh && !force) {
    return cached?.payload ?? EMPTY_META;
  }

  const { data: claimed } = await db.rpc("claim_snapshot_refresh", {
    p_cache_key: CACHE_KEY,
    p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
  });
  const wonClaim = Array.isArray(claimed) ? claimed.length > 0 : Boolean(claimed);

  if (!wonClaim) {
    return cached?.payload ?? EMPTY_META;
  }

  try {
    const meta = await runSync(db);
    await db
      .from("operational_snapshot_cache")
      .update({
        generated_at: meta.syncFinishedAt,
        payload: meta,
        refresh_claimed_at: null,
        last_error: null,
        last_error_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("cache_key", CACHE_KEY);
    return meta;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na sincronização Auvo.";
    await db.rpc("release_snapshot_refresh_claim", { p_cache_key: CACHE_KEY });
    await db
      .from("operational_snapshot_cache")
      .update({ last_error: message, last_error_at: new Date().toISOString() })
      .eq("cache_key", CACHE_KEY);
    await logEvent(db, "auvo", "AUVO_ASSETS_SYNC_FAILURE", { message });
    const previous = cached?.payload ?? EMPTY_META;
    return { ...previous, status: "error", error: message };
  }
}
