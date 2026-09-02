import { ControlledError } from "../../shared/http.ts";

// Duplicado de operation/integrations/auvo/auvo.config.ts (cada Edge
// Function só empacota a própria pasta — sem import entre módulos neste
// projeto). Só os pedaços que este módulo precisa: login/token (idêntico)
// + os paths novos que a leitura nunca usou (customers já existia lá pra
// GET; aqui reaproveitamos o mesmo valor pra POST).
export const AUVO_BASE_URL = "https://api.auvo.com.br/v2";
export const AUVO_LOGIN_PATH = "/login";
export const AUVO_CUSTOMERS_PATH = "/customers";
// Endpoint de tickets — confirmar contra a doc real da Auvo antes de
// depender disso em produção (ver auvoTickets.ts).
export const AUVO_TICKETS_PATH = "/tickets";

export const AUVO_REQUEST_TIMEOUT_MS = 25_000;

// Renova um pouco antes da expiração real — mesmo valor de
// operation/integrations/auvo/auvo.config.ts.
export const AUVO_TOKEN_SAFETY_MARGIN_MS = 2 * 60 * 1000;

export const AUVO_CLAIM_TTL_SECONDS = 20;
export const AUVO_CLAIM_POLL_INTERVAL_MS = 500;
export const AUVO_CLAIM_POLL_MAX_ATTEMPTS = 10;

export interface AuvoCredentials {
  apiKey: string;
  apiToken: string;
}

export function readAuvoCredentials(): AuvoCredentials {
  const apiKey = Deno.env.get("AUVO_API_KEY");
  const apiToken = Deno.env.get("AUVO_API_TOKEN");
  if (!apiKey || !apiToken) {
    throw new ControlledError("Integração com a Auvo não está configurada.", 500);
  }
  return { apiKey, apiToken };
}
