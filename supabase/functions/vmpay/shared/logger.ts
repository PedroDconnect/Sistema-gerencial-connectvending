import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const REDACT_KEY_PATTERN = /token|apikey|apitoken|password/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT_KEY_PATTERN.test(key) ? "[redacted]" : redact(val);
    }
    return out;
  }
  return value;
}

// Eventos técnicos (fetch de machines/vends/installations, erro, duração)
// — nunca o access_token. logEvent nunca lança: uma falha ao gravar
// auditoria não pode derrubar a resposta real ao usuário.
export async function logEvent(
  db: SupabaseClient,
  provider: string,
  event: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.from("integration_events").insert({ provider, event, detail: redact(detail) });
  } catch {
    // intencional: logging nunca deve quebrar o fluxo principal
  }
}
