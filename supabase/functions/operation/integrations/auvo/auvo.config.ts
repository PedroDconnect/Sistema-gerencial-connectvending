export const AUVO_BASE_URL = "https://api.auvo.com.br/v2";
export const AUVO_LOGIN_PATH = "/login";
export const AUVO_TASKS_PATH = "/tasks/";
export const AUVO_CUSTOMERS_PATH = "/customers";
export const AUVO_EQUIPMENTS_PATH = "/equipments";

// Confirmado empiricamente contra a API real: 100 = 200 OK, 150 = 400
// "You cannot request more than 100 tasks per page."
export const AUVO_MAX_PAGE_SIZE = 100;

// Confirmado ao vivo: uma única página de 100 tarefas, sem nenhuma
// concorrência, já leva ~12.5s hoje (a Auvo está mais lenta por página do
// que o histórico "15-20s para o dia inteiro" sugeria). Um timeout de 10-
// 12s por tentativa estava abortando requisições que teriam dado certo,
// gastando as 4 tentativas de retry sem nunca deixar nenhuma completar.
export const AUVO_REQUEST_TIMEOUT_MS = 25_000;

// A contagem (pageSize=1) é bem mais leve que uma página de 100 tarefas —
// /summary (que usa esse mesmo tipo de chamada) responde em segundos
// mesmo em dias ruins da Auvo. Um timeout dedicado mais curto pra ela
// evita o problema que causou "total: 0" ao vivo: com
// AUVO_REQUEST_TIMEOUT_MS (25s) + 3 tentativas, uma única contagem podia
// precisar de até ~76s pra esgotar o retry, mas o orçamento dela
// (COUNT_BUDGET_MS, em operationService.ts) é de só 30s — o
// withDeadline desistia da contagem no meio da 1ª tentativa, mesmo que a
// 2ª fosse ter dado certo rapidinho.
export const AUVO_COUNT_TIMEOUT_MS = 12_000;

// Renova um pouco antes da expiração real para não correr risco de usar
// um token que vence entre a leitura do cache e o uso de fato.
export const AUVO_TOKEN_SAFETY_MARGIN_MS = 2 * 60 * 1000;

// Confirmado empiricamente: disparar muitas chamadas simultâneas para a
// Auvo com o mesmo Bearer token faz a própria API deles falhar de forma
// inconsistente (404 e 500 em requisições que, feitas uma por vez, sempre
// funcionam). Testado ao vivo em dias diferentes: 16 (buscar tudo numa
// onda só) já rendeu tanto o melhor resultado (12/13 páginas em 52s)
// quanto o pior (35 de ~1235 tarefas, rajada de 500 simultâneos da própria
// Auvo em ~2s — sinal de que 16 requisições ao mesmo tempo às vezes
// derruba a Auvo, não só reduz nossa exposição a um pico dela). 8 foi o
// valor mais consistentemente bom nos testes — não elimina os dias ruins
// da Auvo, mas reduz a chance de sermos nós mesmos a causa da rajada de
// erro. Vale pra qualquer paginação contra a Auvo (tasks, customers,
// equipments), não só a original (tasks).
export const AUVO_CONCURRENCY_LIMIT = 8;

export const AUVO_CLAIM_TTL_SECONDS = 20;
export const AUVO_CLAIM_POLL_INTERVAL_MS = 500;
export const AUVO_CLAIM_POLL_MAX_ATTEMPTS = 10;

// Clientes/equipamentos mudam muito menos que tarefas — 30min default
// (vs. os 5min do snapshot de telemetria) evita ressincronizar a cada
// abertura de tela sem deixar o dado envelhecer demais.
export function getAuvoAssetsSyncTtlSeconds(): number {
  const raw = Deno.env.get("AUVO_ASSETS_SYNC_TTL_SECONDS");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1800;
}

// Janela "recente" dos chamados (painel gerencial por cliente): re-checada
// com essa frequência, já que status de tarefa muda (aberta → finalizada)
// — diferente do consumo VMpay, que é imutável uma vez ocorrido.
export function getAuvoTasksSyncTtlSeconds(): number {
  const raw = Deno.env.get("AUVO_TASKS_SYNC_TTL_SECONDS");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1200;
}

// Mesmo raciocínio de FETCH_DEADLINE_MS em operationService.ts — nunca
// deixar uma sincronização de chamados travar até a plataforma matar a
// resposta.
export function getAuvoTasksSyncTimeBudgetMs(): number {
  const raw = Deno.env.get("AUVO_TASKS_SYNC_TIME_BUDGET_MS");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100_000;
}
