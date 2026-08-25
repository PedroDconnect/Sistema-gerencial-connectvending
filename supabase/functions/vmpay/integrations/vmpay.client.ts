import { VMPAY_REQUEST_TIMEOUT_MS } from "./vmpay.config.ts";
import { ControlledError } from "../shared/http.ts";

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

// A VMpay devolve erro como {"error": "mensagem"} (confirmado: pedir
// per_page acima do teto do /vends devolve exatamente esse formato).
function extractMessage(body: unknown): string | null {
  if (body && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return null;
}

// Sem refresh de token — access_token é estático (query param, não
// Bearer), então um 401/403 aqui é erro de configuração, não algo pra
// tentar de novo com um token novo. Retry só cobre falha de rede/timeout
// e 5xx (instabilidade transitória do lado da VMpay).
const RETRY_STATUSES = [500, 502, 503, 504];
const MAX_ATTEMPTS = 3;

export async function vmpayGet(
  baseUrl: string,
  path: string,
  accessToken: string,
  params: Record<string, string | number | undefined> = {}
): Promise<unknown> {
  const query = new URLSearchParams({ access_token: accessToken });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const url = `${baseUrl}${path}?${query.toString()}`;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VMPAY_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) return await res.json();

      const body = await safeJson(res);
      if (RETRY_STATUSES.includes(res.status) && attempt < MAX_ATTEMPTS) {
        await sleep(300 * attempt);
        continue;
      }
      throw new ControlledError(extractMessage(body) ?? `VMpay respondeu ${res.status} em ${path}.`, res.status);
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof ControlledError) throw error;
      lastError = error;
      if (attempt === MAX_ATTEMPTS) {
        throw new ControlledError(`Não foi possível falar com a VMpay (${path}) — tempo esgotado.`, 504);
      }
      await sleep(300 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new ControlledError("Falha desconhecida na VMpay.", 502);
}
