import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { vmpayGet } from "../integrations/vmpay.client.ts";
import { normalizePatrimony } from "./patrimonyUtils.ts";
import {
  readVmpayCredentials,
  VMPAY_VENDS_PAGE_SIZE,
  VMPAY_VENDS_FETCH_CONCURRENCY,
  getVmpaySalesSyncTtlSeconds,
  getVmpaySalesBackfillDays,
  getVmpaySalesSyncTimeBudgetMs,
} from "../integrations/vmpay.config.ts";
import { logEvent } from "../shared/logger.ts";

const CACHE_KEY = "vmpay_sales_sync";
const CLAIM_TTL_SECONDS = 180;
// Teto de segurança por rodada de paginação — o orçamento de tempo
// (getVmpaySalesSyncTimeBudgetMs) já corta antes disso na prática.
const MAX_PAGES_PER_RUN = 100;

// Janela sempre re-checada, independente de onde o backfill histórico
// está. Bug real confirmado ao vivo (20/08/2026): enquanto o backfill
// (60 dias, para trás) estava em andamento, o limite superior da busca
// ficava travado no instante em que o backfill começou — vendas novas
// ("hoje") nunca eram buscadas até o backfill inteiro terminar, o que
// podia levar dezenas de chamadas. Agora "recente" e "histórico" são dois
// cursores independentes: recente sempre reaparece pra cobrir os últimos
// dias de novo (barato, TTL curto), histórico avança pra trás com o que
// sobra de orçamento — nunca um bloqueia o outro.
const RECENT_WINDOW_DAYS = 2;

export interface SalesSyncMeta {
  status: "ok" | "partial" | "error" | null;
  recentRefreshedAt: string | null; // última vez que [agora-2d, agora] foi confirmado 100% sincronizado
  recentCursorAt: string | null; // se essa janela ficou parcial, de onde retomar
  backfillCursorAt: string | null; // até onde o histórico (mais antigo) já foi sincronizado
  backfillComplete: boolean;
  lastRunAt: string | null;
  newSalesCount: number;
  pagesFetched: number;
  error: string | null;
}

const EMPTY_META: SalesSyncMeta = {
  status: null,
  recentRefreshedAt: null,
  recentCursorAt: null,
  backfillCursorAt: null,
  backfillComplete: false,
  lastRunAt: null,
  newSalesCount: 0,
  pagesFetched: 0,
  error: null,
};

interface CacheRow {
  generated_at: string | null;
  payload: SalesSyncMeta | null;
}

async function readCacheRow(db: SupabaseClient): Promise<CacheRow | null> {
  const { data } = await db
    .from("operational_snapshot_cache")
    .select("generated_at, payload")
    .eq("cache_key", CACHE_KEY)
    .maybeSingle();
  return data ?? null;
}

interface NormalizedSale {
  externalSaleId: number;
  vmpayMachineId: number;
  normalizedPatrimony: string;
  occurredAt: string;
  productName: string | null;
  productCategoryId: number | null;
  quantity: number;
  value: number | null;
  raw: Record<string, unknown>;
}

function normalizeSale(raw: Record<string, unknown>): NormalizedSale | null {
  const machine = raw.machine as Record<string, unknown> | undefined;
  const good = raw.good as Record<string, unknown> | undefined;
  const assetNumber = machine?.asset_number;
  const normalized = normalizePatrimony(assetNumber);
  // Sem patrimônio na própria venda não tem como indexar — confirmado ao
  // vivo que isso não acontece nos dados reais, mas não assume, descarta
  // em vez de guardar com chave vazia.
  if (!normalized || typeof raw.id !== "number" || typeof raw.machine_id !== "number" || typeof raw.occurred_at !== "string") {
    return null;
  }

  return {
    externalSaleId: raw.id,
    vmpayMachineId: raw.machine_id,
    normalizedPatrimony: normalized,
    occurredAt: raw.occurred_at,
    productName: typeof good?.name === "string" ? good.name : null,
    productCategoryId: typeof good?.category_id === "number" ? good.category_id : null,
    quantity: typeof raw.quantity === "number" ? raw.quantity : 0,
    value: typeof raw.value === "number" ? raw.value : null,
    raw,
  };
}

interface FetchResult {
  totalSales: number;
  oldestOccurredAt: string | null;
  reachedStart: boolean;
  pagesFetched: number;
}

function remainingMs(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now());
}

async function fetchSalesPage(
  creds: { baseUrl: string; accessToken: string },
  startIso: string,
  endIso: string,
  page: number
): Promise<{ sales: NormalizedSale[]; rawCount: number }> {
  const raw = await vmpayGet(creds.baseUrl, "/vends", creds.accessToken, {
    page,
    per_page: VMPAY_VENDS_PAGE_SIZE,
    start_date: startIso,
    end_date: endIso,
  });
  if (!Array.isArray(raw)) throw new Error("Resposta inesperada da VMpay em /vends.");
  const sales = raw.map((v) => normalizeSale(v as Record<string, unknown>)).filter((v): v is NormalizedSale => v !== null);
  return { sales, rawCount: raw.length };
}

// on conflict do nothing: uma venda já registrada nunca muda (é um evento
// passado) — idempotência real via external_sale_id (vend.id confirmado ao
// vivo), não um composite key inventado.
async function upsertSales(db: SupabaseClient, sales: NormalizedSale[]): Promise<void> {
  if (sales.length === 0) return;
  const rows = sales.map((s) => ({
    external_sale_id: s.externalSaleId,
    vmpay_machine_id: s.vmpayMachineId,
    normalized_patrimony: s.normalizedPatrimony,
    occurred_at: s.occurredAt,
    product_name: s.productName,
    product_category_id: s.productCategoryId,
    quantity: s.quantity,
    value: s.value,
    raw_data: s.raw,
  }));
  const { error } = await db.from("machine_sales").upsert(rows, { onConflict: "external_sale_id", ignoreDuplicates: true });
  if (error) throw new Error(`Falha ao salvar machine_sales: ${error.message}`);
}

async function reaggregate(db: SupabaseClient, since: string, until: string): Promise<void> {
  const { error } = await db.rpc("refresh_machine_consumption_daily", { p_since: since, p_until: until });
  if (error) throw new Error(`Falha ao reagregar machine_consumption_daily: ${error.message}`);
}

// Paginação em rodadas concorrentes (mesmo padrão de fetchVendsWindow em
// vmpayService.ts): não dá pra saber o total de páginas de antemão (a
// VMpay não devolve contagem), então busca em lotes e para na primeira
// rodada com página incompleta (sinal de fim). Cada rodada é salva e
// descartada da memória na hora (nunca acumula milhares de vendas — com
// raw_data completo — num array só até o fim). Respeita um orçamento de
// tempo compartilhado — se estourar, para e devolve o que já tem
// (reachedStart=false), pra retomar na próxima chamada.
async function fetchAndPersistSalesWindow(
  db: SupabaseClient,
  creds: { baseUrl: string; accessToken: string },
  startIso: string,
  endIso: string,
  deadlineAt: number
): Promise<FetchResult> {
  let totalSales = 0;
  let oldestOccurredAt: string | null = null;
  let nextPage = 1;
  let reachedStart = false;
  let pagesFetched = 0;

  while (!reachedStart && nextPage <= MAX_PAGES_PER_RUN && remainingMs(deadlineAt) > 0) {
    const batch: number[] = [];
    for (let i = 0; i < VMPAY_VENDS_FETCH_CONCURRENCY && nextPage <= MAX_PAGES_PER_RUN; i++, nextPage++) {
      batch.push(nextPage);
    }

    const results = await Promise.all(batch.map((page) => fetchSalesPage(creds, startIso, endIso, page)));
    pagesFetched += results.length;

    for (const { sales, rawCount } of results) {
      await upsertSales(db, sales);
      totalSales += sales.length;
      for (const sale of sales) {
        if (!oldestOccurredAt || sale.occurredAt < oldestOccurredAt) oldestOccurredAt = sale.occurredAt;
      }
      if (rawCount < VMPAY_VENDS_PAGE_SIZE) reachedStart = true;
    }
  }

  return { totalSales, oldestOccurredAt, reachedStart, pagesFetched };
}

async function runSalesSync(db: SupabaseClient): Promise<SalesSyncMeta> {
  const creds = readVmpayCredentials();
  const cached = await readCacheRow(db);
  const previous = cached?.payload ?? EMPTY_META;
  const now = new Date();
  const deadlineAt = Date.now() + getVmpaySalesSyncTimeBudgetMs();

  const recentFloor = new Date(now.getTime() - RECENT_WINDOW_DAYS * 86_400_000).toISOString();
  const backfillFloor = new Date(now.getTime() - getVmpaySalesBackfillDays() * 86_400_000).toISOString();
  const recentTtlMs = getVmpaySalesSyncTtlSeconds() * 1000;

  let totalSales = 0;
  let pagesFetched = 0;

  // Fase 1 — janela recente, sempre priorizada: refeita sempre que o TTL
  // passar OU se ficou parcial na chamada anterior, nunca depende de o
  // backfill histórico ter terminado.
  let recentRefreshedAt = previous.recentRefreshedAt;
  let recentCursorAt = previous.recentCursorAt;
  const recentStale = !recentRefreshedAt || Date.now() - new Date(recentRefreshedAt).getTime() > recentTtlMs;

  if (recentStale || recentCursorAt) {
    const to = recentCursorAt ?? now.toISOString();
    const r = await fetchAndPersistSalesWindow(db, creds, recentFloor, to, deadlineAt);
    totalSales += r.totalSales;
    pagesFetched += r.pagesFetched;
    if (r.totalSales > 0 && r.oldestOccurredAt) await reaggregate(db, r.oldestOccurredAt, to);

    if (r.reachedStart) {
      recentRefreshedAt = now.toISOString();
      recentCursorAt = null;
    } else {
      recentCursorAt = r.oldestOccurredAt ?? recentCursorAt ?? to;
    }
  }

  // Fase 2 — backfill histórico, com o que sobrar do orçamento. Upper
  // bound é sempre recentFloor (recalculado a cada chamada, "agora - 2
  // dias") na primeira vez; depois disso, backfillCursorAt já é mais
  // antigo que qualquer recentFloor futuro, então nunca colide com a fase 1.
  let backfillCursorAt = previous.backfillCursorAt;
  let backfillComplete = previous.backfillComplete;

  if (!backfillComplete && remainingMs(deadlineAt) > 0) {
    const to = backfillCursorAt ?? recentFloor;
    const r = await fetchAndPersistSalesWindow(db, creds, backfillFloor, to, deadlineAt);
    totalSales += r.totalSales;
    pagesFetched += r.pagesFetched;
    if (r.totalSales > 0 && r.oldestOccurredAt) await reaggregate(db, r.oldestOccurredAt, to);

    if (r.reachedStart) {
      backfillComplete = true;
      backfillCursorAt = null;
    } else {
      backfillCursorAt = r.oldestOccurredAt ?? backfillCursorAt ?? to;
    }
  }

  const meta: SalesSyncMeta = {
    status: recentCursorAt || !backfillComplete ? "partial" : "ok",
    recentRefreshedAt,
    recentCursorAt,
    backfillCursorAt,
    backfillComplete,
    lastRunAt: new Date().toISOString(),
    newSalesCount: totalSales,
    pagesFetched,
    error: null,
  };

  await logEvent(db, "vmpay", "VMPAY_SALES_SYNC_SUCCESS", {
    status: meta.status,
    newSalesCount: meta.newSalesCount,
    pagesFetched: meta.pagesFetched,
    recentRefreshedAt,
    backfillComplete,
  });

  return meta;
}

export async function ensureFreshSales(
  db: SupabaseClient,
  { force = false }: { force?: boolean } = {}
): Promise<SalesSyncMeta> {
  const cached = await readCacheRow(db);
  const ttlMs = getVmpaySalesSyncTtlSeconds() * 1000;
  // Trabalho pendente (janela recente parcial ou backfill não terminado)
  // nunca espera o TTL — continua na próxima chance possível.
  const pending = Boolean(cached?.payload?.recentCursorAt) || cached?.payload?.backfillComplete === false;
  const isFresh = Boolean(!pending && cached?.generated_at && Date.now() - new Date(cached.generated_at).getTime() < ttlMs);

  if (isFresh && !force) return cached?.payload ?? EMPTY_META;

  const { data: claimed } = await db.rpc("claim_snapshot_refresh", {
    p_cache_key: CACHE_KEY,
    p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
  });
  const wonClaim = Array.isArray(claimed) ? claimed.length > 0 : Boolean(claimed);
  if (!wonClaim) return cached?.payload ?? EMPTY_META;

  try {
    const meta = await runSalesSync(db);
    await db
      .from("operational_snapshot_cache")
      .update({
        generated_at: new Date().toISOString(),
        payload: meta,
        refresh_claimed_at: null,
        last_error: null,
        last_error_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("cache_key", CACHE_KEY);
    return meta;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na sincronização de vendas.";
    await db.rpc("release_snapshot_refresh_claim", { p_cache_key: CACHE_KEY });
    await db
      .from("operational_snapshot_cache")
      .update({ last_error: message, last_error_at: new Date().toISOString() })
      .eq("cache_key", CACHE_KEY);
    await logEvent(db, "vmpay", "VMPAY_SALES_SYNC_FAILURE", { message });
    const previous = cached?.payload ?? EMPTY_META;
    return { ...previous, status: "error", error: message };
  }
}
