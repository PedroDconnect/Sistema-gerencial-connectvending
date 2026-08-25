import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { login } from "./auvo.auth.ts";
import {
  AUVO_CLAIM_TTL_SECONDS,
  AUVO_CLAIM_POLL_INTERVAL_MS,
  AUVO_CLAIM_POLL_MAX_ATTEMPTS,
  AUVO_TOKEN_SAFETY_MARGIN_MS,
} from "./auvo.config.ts";
import { logEvent } from "../../shared/logger.ts";

const PROVIDER = "auvo";

interface TokenRow {
  access_token: string | null;
  expires_at: string | null;
}

function isValid(row: TokenRow | null | undefined): row is { access_token: string; expires_at: string } {
  if (!row?.access_token || !row?.expires_at) return false;
  return new Date(row.expires_at).getTime() - AUVO_TOKEN_SAFETY_MARGIN_MS > Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readToken(db: SupabaseClient): Promise<TokenRow | null> {
  const { data } = await db
    .from("integration_tokens")
    .select("access_token, expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle();
  return data ?? null;
}

// Só quem ganhou o claim (ver claim_token_refresh no schema.sql) chega
// aqui — não existe concorrência real dentro desta função.
async function performLogin(db: SupabaseClient, apiKey: string, apiToken: string): Promise<string> {
  try {
    const { accessToken, expiresAt } = await login(apiKey, apiToken);
    await db
      .from("integration_tokens")
      .update({
        access_token: accessToken,
        expires_at: expiresAt,
        refresh_claimed_at: null,
        last_success_at: new Date().toISOString(),
        last_error: null,
        last_error_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", PROVIDER);
    await logEvent(db, PROVIDER, "AUVO_LOGIN_SUCCESS", {});
    return accessToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no login da Auvo.";
    await db
      .from("integration_tokens")
      .update({ last_error: message, last_error_at: new Date().toISOString() })
      .eq("provider", PROVIDER);
    // Libera o lock para não deixar quem está fazendo poll travado até o
    // fim do TTL do claim só porque este login específico falhou.
    await db.rpc("release_token_refresh_claim", { p_provider: PROVIDER });
    await logEvent(db, PROVIDER, "AUVO_LOGIN_FAILURE", { message });
    throw new Error("Não foi possível autenticar com a Auvo.");
  }
}

async function waitForFreshToken(db: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < AUVO_CLAIM_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(AUVO_CLAIM_POLL_INTERVAL_MS);
    const row = await readToken(db);
    if (isValid(row)) return row.access_token;
  }
  throw new Error("Não foi possível autenticar com a Auvo.");
}

async function acquireToken(db: SupabaseClient, apiKey: string, apiToken: string): Promise<string> {
  const { data: claimed } = await db.rpc("claim_token_refresh", {
    p_provider: PROVIDER,
    p_claim_ttl_seconds: AUVO_CLAIM_TTL_SECONDS,
  });

  const wonClaim = Array.isArray(claimed) ? claimed.length > 0 : Boolean(claimed);
  if (wonClaim) {
    await logEvent(db, PROVIDER, "AUVO_TOKEN_REFRESH", { wonClaim: true });
    return performLogin(db, apiKey, apiToken);
  }

  // Outra invocação já está renovando (linha reivindicada há poucos
  // segundos) — espera em vez de logar de novo.
  return waitForFreshToken(db);
}

export async function getValidToken(db: SupabaseClient, apiKey: string, apiToken: string): Promise<string> {
  const current = await readToken(db);
  if (isValid(current)) return current.access_token;
  return acquireToken(db, apiKey, apiToken);
}

// Usado quando a Auvo responde 401 mesmo com um token que o nosso cache
// achava válido — trata como expirado na hora, sem checar o cache de novo.
export async function forceRefresh(db: SupabaseClient, apiKey: string, apiToken: string): Promise<string> {
  return acquireToken(db, apiKey, apiToken);
}
