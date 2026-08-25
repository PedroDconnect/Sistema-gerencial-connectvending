// Módulo Operação — camada executiva sobre APIs de campo, começando pela
// Auvo. Nenhuma credencial ou Bearer token aqui: tudo isolado em
// integrations/auvo/. Nenhum KPI é persistido — cada request consulta a
// Auvo em tempo real (com cache técnico curto só pra deduplicar chamadas
// idênticas em poucos segundos, ver shared/cache.ts).
//
// Configurar antes do primeiro uso:
//   supabase secrets set AUVO_API_KEY=<apiKey> AUVO_API_TOKEN=<apiToken>
//   supabase functions deploy operation

import { getServiceClient } from "./shared/db.ts";
import { route } from "./router.ts";

Deno.serve(async (req) => {
  const db = getServiceClient();
  return route(req, db);
});
