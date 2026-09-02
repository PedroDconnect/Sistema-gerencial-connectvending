// Janela de vendas — não é env var, pra nunca ser mudada por acidente sem
// querer. Pedido original era 2h; foi pra 5h; ajustado pra 24h a pedido
// explícito (13/08/2026) — o time às vezes não sobe dose dentro de 5h sem
// que isso seja um problema real.
export const VMPAY_VENDS_WINDOW_HOURS = 24;

// Confirmado empiricamente contra a API real (13/08/2026):
// - /machines e /locations: "page"/"per_page" são ignorados, sempre
//   devolvem tudo de uma vez (775 máquinas, 402 locations) — sem envelope,
//   array puro.
// - /installations (sem machine_id — endpoint em lote): pagina de verdade,
//   devolve só as ativas (removed_at null), array puro.
// - /vends: pagina de verdade, aceita start_date/end_date (ISO 8601 UTC)
//   como filtro real (confirmado: janela em 2010 devolveu 0 registros),
//   ordenado decrescente por occurred_at, teto de per_page=1000 (acima
//   disso a própria API devolve 400 "O número de registros por página
//   deve ser menor ou igual a 1000").
export const VMPAY_VENDS_PAGE_SIZE = 1000;
export const VMPAY_INSTALLATIONS_PAGE_SIZE = 1000;

// Tetos de segurança — nunca paginar sem limite. ~3.100 vendas em 2h foi o
// volume real observado (~1.565/h) — numa janela de 24h isso dá ~37.500,
// ~38 páginas de 1000. 100 páginas dá bastante margem (>2x) sem deixar a
// busca correr sem fim se o volume disparar. Ajustar de novo se
// VMPAY_VENDS_WINDOW_HOURS mudar — o teto precisa cobrir o volume da
// janela inteira, senão /vends corta antes do fim e máquinas com venda
// fora das páginas buscadas aparecem como "sem doses" por engano.
export const VMPAY_VENDS_MAX_PAGES = 100;
export const VMPAY_INSTALLATIONS_MAX_PAGES = 20;

// Quantas páginas de /vends buscar em paralelo por rodada — não tem como
// saber o total de páginas antes (a API não devolve contagem), então
// busca em lotes concorrentes e para na primeira rodada que trouxer uma
// página incompleta (< page size), em vez de 1 requisição de cada vez.
export const VMPAY_VENDS_FETCH_CONCURRENCY = 5;

export const VMPAY_REQUEST_TIMEOUT_MS = 20_000;

function readIntEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getVmpayCacheTtlSeconds(): number {
  return readIntEnv("VMPAY_CACHE_TTL_SECONDS", 300);
}

// Cruzamento Auvo × VMpay por patrimônio (registry) e histórico de vendas
// (sales) — patrimônio/cliente mudam bem menos que a lista de vendas do
// dia, daí o TTL mais longo pro registry.
export function getVmpayRegistrySyncTtlSeconds(): number {
  return readIntEnv("VMPAY_REGISTRY_SYNC_TTL_SECONDS", 1800);
}

export function getVmpaySalesSyncTtlSeconds(): number {
  return readIntEnv("VMPAY_SALES_SYNC_TTL_SECONDS", 900);
}

// Primeira sincronização (sem watermark salvo ainda): quantos dias de
// histórico buscar. Configurável de propósito — o volume real de
// vendas/dia só se confirma depois de rodar a primeira vez.
export function getVmpaySalesBackfillDays(): number {
  return readIntEnv("VMPAY_SALES_BACKFILL_DAYS", 60);
}

// Mesmo raciocínio de FETCH_DEADLINE_MS em operationService.ts: a
// plataforma mata a Function em 150s — um backfill grande nunca tenta
// terminar tudo numa chamada só, processa o que der dentro do orçamento e
// avança o watermark parcialmente; a próxima sincronização continua daí.
export function getVmpaySalesSyncTimeBudgetMs(): number {
  return readIntEnv("VMPAY_SALES_SYNC_TIME_BUDGET_MS", 100_000);
}

// Há quanto tempo uma venda pode ficar guardada linha a linha em
// machine_sales antes de ser limpa (ver deleteStaleSales em
// salesSyncService.ts). Pedido explícito (02/09/2026): machine_sales
// nunca deve crescer pra sempre — o histórico de verdade, sem prazo de
// validade, vive em machine_consumption_daily (agregado, ~centenas de KB
// mesmo depois de anos). A linha crua só precisa sobreviver o suficiente
// pra alimentar o detalhamento "consumo por produto" de um período
// recente (ver getMachineConsumption) — 90 dias cobre até o preset "30
// dias" com folga.
export function getVmpaySalesRetentionDays(): number {
  return readIntEnv("VMPAY_SALES_RETENTION_DAYS", 90);
}

export interface VmpayCredentials {
  baseUrl: string;
  accessToken: string;
}

export function readVmpayCredentials(): VmpayCredentials {
  const baseUrl = Deno.env.get("VMPAY_BASE_URL");
  const accessToken = Deno.env.get("VMPAY_ACCESS_TOKEN");
  if (!baseUrl || !accessToken) {
    throw new Error("Integração com a VMpay não está configurada.");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), accessToken };
}
