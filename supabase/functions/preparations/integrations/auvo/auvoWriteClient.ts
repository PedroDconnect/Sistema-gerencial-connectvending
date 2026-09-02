import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getValidToken, forceRefresh } from "./auvo.tokenManager.ts";
import { AUVO_BASE_URL, AUVO_REQUEST_TIMEOUT_MS, AuvoCredentials } from "./auvo.config.ts";
import { logEvent } from "../../shared/logger.ts";
import { ControlledError } from "../../shared/http.ts";

// NOVO — não existe em nenhum outro lugar do projeto (confirmado por
// investigação antes de implementar): auvo.client.ts (módulo operation) e
// vmpay.client.ts só fazem GET, hardcoded, sem parâmetro de method/body.
// O único POST que a Auvo já recebia neste repo era o login (auvo.auth.ts),
// que é uma chamada solta, não uma peça reaproveitável de retry/token.
//
// Isto aqui é essa peça que faltava: mesma autenticação/retry/refresh de
// auvo.client.ts#requestJson, generalizado pra aceitar method + body —
// usado tanto pra GET (busca de cliente, sync de status) quanto POST
// (criar cliente, criar ticket) contra a Auvo.
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
  if (Array.isArray(body) && typeof (body[0] as { errors?: unknown[] })?.errors?.[0] === "string") {
    return (body[0] as { errors: string[] }).errors[0];
  }
  if (typeof (body as { message?: unknown })?.message === "string") return (body as { message: string }).message;
  return null;
}

export interface AuvoRequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  timeoutMs?: number;
}

async function rawFetch(path: string, token: string, options: AuvoRequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? AUVO_REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${AUVO_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const RETRY_STATUSES = [500, 502, 503, 504];
const MAX_ATTEMPTS = 2;

// Mesmo espírito do retry de auvo.client.ts: no máximo 2 tentativas, 429
// respeita Retry-After, nunca laço infinito. POST/PATCH NÃO entram no
// retry de rede/timeout por padrão fora daqui (ver requestJson) — reenviar
// uma criação de ticket sem saber se a primeira tentativa criou ou não é
// exatamente o risco de duplicidade que a spec pede pra evitar; a
// idempotência de verdade fica por conta do external_id determinístico +
// índice único no banco, não de "tentar de novo cegamente" aqui.
async function fetchWithRetry(db: SupabaseClient, path: string, token: string, options: AuvoRequestOptions): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await rawFetch(path, token, options);
    } catch {
      if (attempt === MAX_ATTEMPTS) {
        throw new ControlledError("Não foi possível falar com a Auvo (tempo esgotado).", 504);
      }
      await sleep(400 * attempt);
      continue;
    }

    if (res.status === 429) {
      await logEvent(db, "auvo", "AUVO_RATE_LIMIT", { attempt, path });
      if (attempt === MAX_ATTEMPTS) return res;
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 800 * attempt;
      await sleep(Math.min(Number.isFinite(waitMs) ? waitMs : 800 * attempt, 5000));
      continue;
    }

    if (RETRY_STATUSES.includes(res.status) && attempt < MAX_ATTEMPTS) {
      await sleep(400 * attempt);
      continue;
    }

    return res;
  }

  throw new ControlledError("Não foi possível falar com a Auvo.", 502);
}

export async function auvoRequest(
  db: SupabaseClient,
  creds: AuvoCredentials,
  path: string,
  options: AuvoRequestOptions = {}
): Promise<Record<string, unknown>> {
  let token = await getValidToken(db, creds.apiKey, creds.apiToken);
  let res = await fetchWithRetry(db, path, token, options);

  if (res.status === 401) {
    token = await forceRefresh(db, creds.apiKey, creds.apiToken);
    res = await fetchWithRetry(db, path, token, options);
    if (res.status === 401) throw new ControlledError("Não foi possível autenticar com a Auvo.", 502);
  }

  if (!res.ok) {
    const body = await safeJson(res);
    await logEvent(db, "auvo", "AUVO_REQUEST_ERROR", { status: res.status, path, method: options.method ?? "GET" });
    throw new ControlledError(extractMessage(body) ?? "Não foi possível completar a operação na Auvo.", res.status);
  }

  return ((await safeJson(res)) as Record<string, unknown>) ?? {};
}
