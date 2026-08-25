import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllMachines } from "./vmpayService.ts";
import { normalizePatrimony } from "./patrimonyUtils.ts";
import { readVmpayCredentials } from "../integrations/vmpay.config.ts";
import { getVmpayRegistrySyncTtlSeconds } from "../integrations/vmpay.config.ts";
import { logEvent } from "../shared/logger.ts";

const CACHE_KEY = "vmpay_registry_sync";
const CLAIM_TTL_SECONDS = 60;

export interface RegistrySyncMeta {
  syncedAt: string | null;
  status: "ok" | "error" | null;
  auvoCount: number;
  vmpayCount: number;
  matched: number;
  matchedNormalized: number;
  notFound: number;
  duplicate: number;
  error: string | null;
}

const EMPTY_META: RegistrySyncMeta = {
  syncedAt: null,
  status: null,
  auvoCount: 0,
  vmpayCount: 0,
  matched: 0,
  matchedNormalized: 0,
  notFound: 0,
  duplicate: 0,
  error: null,
};

interface CacheRow {
  generated_at: string | null;
  payload: RegistrySyncMeta | null;
}

async function readCacheRow(db: SupabaseClient): Promise<CacheRow | null> {
  const { data } = await db
    .from("operational_snapshot_cache")
    .select("generated_at, payload")
    .eq("cache_key", CACHE_KEY)
    .maybeSingle();
  return data ?? null;
}

interface AuvoEquipmentRow {
  auvo_id: number;
  identifier: string | null;
}

// PostgREST corta em 1000 linhas por padrão (db.max_rows) — sem paginar
// aqui, auvo_equipments (~1.540 linhas hoje) seria lido pela metade em
// silêncio. Mesmo teto de página das outras paginações do projeto.
const AUVO_EQUIPMENTS_PAGE_SIZE = 1000;

async function fetchAllAuvoEquipments(db: SupabaseClient): Promise<AuvoEquipmentRow[]> {
  const all: AuvoEquipmentRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await db
      .from("auvo_equipments")
      .select("auvo_id, identifier")
      .range(from, from + AUVO_EQUIPMENTS_PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao ler auvo_equipments: ${error.message}`);
    const page = (data ?? []) as AuvoEquipmentRow[];
    all.push(...page);
    if (page.length < AUVO_EQUIPMENTS_PAGE_SIZE) break;
    from += AUVO_EQUIPMENTS_PAGE_SIZE;
  }

  return all;
}

// Auvo é a âncora (auvo_equipments já sincronizado pela function "operation"
// — lido aqui direto do Postgres, sem duplicar a integração Auvo nem
// importar código entre functions). VMpay é buscado ao vivo (só /machines,
// devolve tudo numa chamada só — confirmado em vmpayService.ts).
async function runRegistrySync(db: SupabaseClient): Promise<RegistrySyncMeta> {
  const creds = readVmpayCredentials();

  const [auvoEquipments, vmpayMachines] = await Promise.all([fetchAllAuvoEquipments(db), fetchAllMachines(creds, db)]);

  // Índice O(m) — nunca um .find() dentro do loop de equipamentos Auvo
  // (seção de performance do pedido: O(n+m), não O(n×m)). Mais de uma
  // máquina VMpay cai no mesmo patrimônio normalizado → DUPLICATE.
  const vmpayByPatrimony = new Map<string, typeof vmpayMachines>();
  for (const machine of vmpayMachines) {
    const normalized = normalizePatrimony(machine.assetNumber);
    if (!normalized) continue;
    const bucket = vmpayByPatrimony.get(normalized);
    if (bucket) bucket.push(machine);
    else vmpayByPatrimony.set(normalized, [machine]);
  }

  let matched = 0;
  let matchedNormalized = 0;
  let notFound = 0;
  let duplicate = 0;

  const rows = auvoEquipments.map((equipment) => {
    const normalized = normalizePatrimony(equipment.identifier);
    const candidates = normalized ? vmpayByPatrimony.get(normalized) ?? [] : [];

    let matchStatus: "MATCH" | "MATCH_NORMALIZED" | "NOT_FOUND" | "DUPLICATE";
    let vmpayMachineId: number | null = null;
    let vmpayAssetNumber: string | null = null;
    let vmpayMachineModelId: number | null = null;

    if (!normalized || candidates.length === 0) {
      matchStatus = "NOT_FOUND";
      notFound += 1;
    } else if (candidates.length > 1) {
      // Ambíguo de propósito: não adivinha qual candidato é o certo (seção
      // 46 do pedido de Operação Completa — "um relacionamento errado é
      // pior que aparecer como sem cliente" — mesmo princípio aqui).
      matchStatus = "DUPLICATE";
      duplicate += 1;
    } else {
      const candidate = candidates[0];
      const rawMatch = (equipment.identifier ?? "").trim().toUpperCase() === (candidate.assetNumber ?? "").trim().toUpperCase();
      matchStatus = rawMatch ? "MATCH" : "MATCH_NORMALIZED";
      if (rawMatch) matched += 1;
      else matchedNormalized += 1;
      vmpayMachineId = candidate.id;
      vmpayAssetNumber = candidate.assetNumber;
      vmpayMachineModelId = candidate.machineModelId;
    }

    return {
      auvo_equipment_id: equipment.auvo_id,
      auvo_identifier: equipment.identifier,
      normalized_patrimony: normalized ?? "",
      vmpay_machine_id: vmpayMachineId,
      vmpay_asset_number: vmpayAssetNumber,
      vmpay_machine_model_id: vmpayMachineModelId,
      match_status: matchStatus,
      candidate_count: candidates.length,
      computed_at: new Date().toISOString(),
    };
  });

  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await db.from("machine_patrimony_registry").upsert(chunk, { onConflict: "auvo_equipment_id" });
    if (error) throw new Error(`Falha ao salvar machine_patrimony_registry: ${error.message}`);
  }

  await logEvent(db, "vmpay", "VMPAY_REGISTRY_SYNC_SUCCESS", {
    auvoCount: auvoEquipments.length,
    vmpayCount: vmpayMachines.length,
    matched,
    matchedNormalized,
    notFound,
    duplicate,
  });

  return {
    syncedAt: new Date().toISOString(),
    status: "ok",
    auvoCount: auvoEquipments.length,
    vmpayCount: vmpayMachines.length,
    matched,
    matchedNormalized,
    notFound,
    duplicate,
    error: null,
  };
}

// Mesmo padrão de single-flight já usado em toda sincronização do projeto
// (getMachineMonitorSnapshot, ensureFreshAssetsSnapshot): só quem ganha o
// claim sincroniza; quem não ganha lê o que já está no Postgres, nunca
// espera. Falha nunca apaga o registry anterior.
export async function ensureFreshRegistry(
  db: SupabaseClient,
  { force = false }: { force?: boolean } = {}
): Promise<RegistrySyncMeta> {
  const cached = await readCacheRow(db);
  const ttlMs = getVmpayRegistrySyncTtlSeconds() * 1000;
  const isFresh = Boolean(cached?.generated_at && Date.now() - new Date(cached.generated_at).getTime() < ttlMs);

  if (isFresh && !force) return cached?.payload ?? EMPTY_META;

  const { data: claimed } = await db.rpc("claim_snapshot_refresh", {
    p_cache_key: CACHE_KEY,
    p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
  });
  const wonClaim = Array.isArray(claimed) ? claimed.length > 0 : Boolean(claimed);
  if (!wonClaim) return cached?.payload ?? EMPTY_META;

  try {
    const meta = await runRegistrySync(db);
    await db
      .from("operational_snapshot_cache")
      .update({
        generated_at: meta.syncedAt,
        payload: meta,
        refresh_claimed_at: null,
        last_error: null,
        last_error_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("cache_key", CACHE_KEY);
    return meta;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no cruzamento Auvo × VMpay.";
    await db.rpc("release_snapshot_refresh_claim", { p_cache_key: CACHE_KEY });
    await db
      .from("operational_snapshot_cache")
      .update({ last_error: message, last_error_at: new Date().toISOString() })
      .eq("cache_key", CACHE_KEY);
    await logEvent(db, "vmpay", "VMPAY_REGISTRY_SYNC_FAILURE", { message });
    const previous = cached?.payload ?? EMPTY_META;
    return { ...previous, status: "error", error: message };
  }
}
