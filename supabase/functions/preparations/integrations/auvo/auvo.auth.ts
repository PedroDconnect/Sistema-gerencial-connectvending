import { AUVO_BASE_URL, AUVO_LOGIN_PATH, AUVO_REQUEST_TIMEOUT_MS } from "./auvo.config.ts";

// Duplicado ao pé da letra de operation/integrations/auvo/auvo.auth.ts —
// é o mesmo endpoint de login, a mesma Auvo, as mesmas credenciais
// (AUVO_API_KEY/AUVO_API_TOKEN); só não há como importar entre módulos
// nesta plataforma.
export interface AuvoLoginResult {
  accessToken: string;
  expiresAt: string; // ISO 8601 UTC
}

// A Auvo devolve "yyyy-MM-dd HH:mm:ss" sem timezone — confirmado (módulo
// operation) que é horário de Brasília (UTC-3), sem horário de verão desde
// 2019, então esse offset fixo é seguro.
function parseAuvoDate(value: string): string {
  return new Date(`${value.replace(" ", "T")}-03:00`).toISOString();
}

export async function login(apiKey: string, apiToken: string): Promise<AuvoLoginResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUVO_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${AUVO_BASE_URL}${AUVO_LOGIN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, apiToken }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Login na Auvo falhou (HTTP ${res.status}).`);
    }

    const payload = await res.json();
    const result = payload?.result;
    if (!result?.authenticated || !result?.accessToken) {
      throw new Error("Auvo não autenticou com as credenciais configuradas.");
    }

    return {
      accessToken: result.accessToken as string,
      expiresAt: parseAuvoDate(result.expiration as string),
    };
  } finally {
    clearTimeout(timeout);
  }
}
