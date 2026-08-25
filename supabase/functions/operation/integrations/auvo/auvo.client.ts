import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getValidToken, forceRefresh } from "./auvo.tokenManager.ts";
import {
  AUVO_BASE_URL,
  AUVO_TASKS_PATH,
  AUVO_MAX_PAGE_SIZE,
  AUVO_REQUEST_TIMEOUT_MS,
  AUVO_COUNT_TIMEOUT_MS,
} from "./auvo.config.ts";
import { logEvent } from "../../shared/logger.ts";
import { ControlledError } from "../../shared/http.ts";

export interface AuvoCredentials {
  apiKey: string;
  apiToken: string;
}

// Confirmados empiricamente contra a API real — não documentados no
// material recebido, validados com chamadas de leitura reais.
export interface AuvoParamFilter {
  startDate?: string;
  endDate?: string;
  customerId?: number;
  status?: number;
  idUserTo?: number; // técnico
  type?: number; // tipo de tarefa
}

interface AuvoListParams {
  paramFilter: AuvoParamFilter;
  page: number;
  pageSize: number;
}

interface AuvoListResult {
  entityList: Record<string, unknown>[];
  totalItems: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractMessage(body: unknown): string | null {
  if (!body) return null;
  if (Array.isArray(body) && typeof body[0]?.errors?.[0] === "string") return body[0].errors[0];
  if (typeof (body as { message?: unknown })?.message === "string") {
    return (body as { message: string }).message;
  }
  return null;
}

async function rawFetch(path: string, token: string, timeoutMs: number = AUVO_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${AUVO_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const DEFAULT_RETRY_STATUSES = [500, 502, 503, 504];

// Retry controlado: os status em retryStatuses e falha de rede/timeout
// tentam de novo com backoff curto; 429 respeita Retry-After quando
// presente. Nunca laço infinito — no máximo 4 tentativas por chamada.
//
// 404 entra na lista de retry só para a listagem de tarefas: confirmado
// empiricamente que disparar várias chamadas simultâneas para a Auvo com
// o mesmo token faz a própria API deles devolver 404/500 de forma
// inconsistente em requisições que, feitas uma por vez, sempre funcionam
// — não é "não encontrado" de verdade nesse endpoint.
async function fetchWithRetry(
  db: SupabaseClient,
  path: string,
  token: string,
  retryStatuses: number[] = DEFAULT_RETRY_STATUSES,
  timeoutMs: number = AUVO_REQUEST_TIMEOUT_MS
): Promise<Response> {
  // Testado ao vivo: numa página isolada (zero concorrência nossa), 3
  // tentativas de 25s cada esgotaram em 77s sem a Auvo responder nem uma
  // vez — não é uma rajada breve pra "atravessar com mais tentativas", é
  // a própria Auvo não conseguindo servir página de tarefa completa
  // (contagem pageSize=1 continua rápida — o problema é específico do
  // payload pesado). Mais tentativas nesse cenário só consome o prazo
  // geral (FETCH_DEADLINE_MS) sem aumentar a chance de sucesso — 2 é
  // suficiente pra cobrir uma falha realmente transitória sem desperdiçar
  // o orçamento em algo que não vai se resolver por conta própria.
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await rawFetch(path, token, timeoutMs);
    } catch {
      if (attempt === maxAttempts) {
        throw new ControlledError("Não foi possível atualizar os dados da operação (tempo esgotado).", 504);
      }
      await sleep(400 * attempt);
      continue;
    }

    if (res.status === 429) {
      await logEvent(db, "auvo", "AUVO_RATE_LIMIT", { attempt });
      if (attempt === maxAttempts) return res;
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 800 * attempt;
      await sleep(Math.min(Number.isFinite(waitMs) ? waitMs : 800 * attempt, 5000));
      continue;
    }

    if (retryStatuses.includes(res.status) && attempt < maxAttempts) {
      await sleep(400 * attempt);
      continue;
    }

    return res;
  }

  throw new ControlledError("Não foi possível atualizar os dados da operação.", 502);
}

export async function requestJson(
  db: SupabaseClient,
  creds: AuvoCredentials,
  path: string,
  retryStatuses?: number[],
  timeoutMs?: number
): Promise<Record<string, unknown>> {
  let token = await getValidToken(db, creds.apiKey, creds.apiToken);
  let res = await fetchWithRetry(db, path, token, retryStatuses, timeoutMs);

  if (res.status === 401) {
    token = await forceRefresh(db, creds.apiKey, creds.apiToken);
    res = await fetchWithRetry(db, path, token, retryStatuses, timeoutMs);
    if (res.status === 401) {
      throw new ControlledError("Não foi possível autenticar com a Auvo.", 502);
    }
  }

  if (!res.ok) {
    const body = await safeJson(res);
    await logEvent(db, "auvo", "AUVO_REQUEST_ERROR", { status: res.status });
    // Preserva o status real (antes colapsava tudo que não fosse 400 em
    // 502 genérico) — sem isso, quem chama (ex.: getTaskByIdRaw, que já
    // checava error.status === 404 pra tratar como "não encontrado", ou
    // o sync de chamados, que precisa saber que 404 aqui é "zero
    // resultados de verdade" e não uma falha real) nunca conseguia
    // distinguir 404 de qualquer outro erro — bug confirmado ao vivo
    // (20/08/2026): um dia sem nenhuma tarefa entrava em loop de retry
    // infinito achando que tinha falhado.
    throw new ControlledError(extractMessage(body) ?? "Não foi possível atualizar os dados da operação.", res.status);
  }

  return (await res.json()) as Record<string, unknown>;
}

export async function listTasksRaw(
  db: SupabaseClient,
  creds: AuvoCredentials,
  params: AuvoListParams,
  timeoutMs?: number
): Promise<AuvoListResult> {
  const pageSize = Math.min(params.pageSize, AUVO_MAX_PAGE_SIZE);
  const query = new URLSearchParams({
    paramFilter: JSON.stringify(params.paramFilter),
    page: String(params.page),
    pageSize: String(pageSize),
    order: "Asc",
  });

  // 404 aqui não é retriável: confirmado que a Auvo devolve 404/500 de
  // forma determinística quando o filtro (em especial "status") não tem
  // nenhuma tarefa correspondente — retry não resolveria, e quem chama
  // (countTasksRaw via safeCount no OperationService) já sabe tratar esse
  // erro como zero quando faz sentido.
  const payload = await requestJson(db, creds, `${AUVO_TASKS_PATH}?${query.toString()}`, undefined, timeoutMs);
  const result = payload.result as Record<string, unknown> | undefined;
  const paged = result?.pagedSearchReturnData as Record<string, unknown> | undefined;

  return {
    entityList: (result?.entityList as Record<string, unknown>[]) ?? [],
    totalItems: typeof paged?.totalItems === "number" ? paged.totalItems : 0,
  };
}

// Contagem "quase grátis": pageSize=1 + lê só totalItems, sem processar a
// lista — é assim que o /summary evita baixar tarefa por tarefa só para
// contar. Timeout dedicado mais curto (AUVO_COUNT_TIMEOUT_MS): é uma
// chamada bem mais leve que uma página de 100 tarefas, e precisa caber
// com folga dentro do orçamento próprio da contagem (COUNT_BUDGET_MS em
// operationService.ts) mesmo já contando com o retry.
export async function countTasksRaw(
  db: SupabaseClient,
  creds: AuvoCredentials,
  paramFilter: AuvoParamFilter
): Promise<number> {
  const { totalItems } = await listTasksRaw(db, creds, { paramFilter, page: 1, pageSize: 1 }, AUVO_COUNT_TIMEOUT_MS);
  return totalItems;
}

export async function getTaskByIdRaw(
  db: SupabaseClient,
  creds: AuvoCredentials,
  id: number
): Promise<Record<string, unknown> | null> {
  try {
    const payload = await requestJson(db, creds, `${AUVO_TASKS_PATH}${id}`);
    return (payload.result as Record<string, unknown>) ?? null;
  } catch (error) {
    if (error instanceof ControlledError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
}
