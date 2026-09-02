// Módulo Pedidos de Preparação de Máquinas × Auvo (handoff de spec,
// 02/09/2026). Reaproveita a mesma autenticação Auvo já usada em
// "operation" (login/token cacheado em integration_tokens, provider
// "auvo") — estendida aqui com um client que também faz POST (ver
// integrations/auvo/auvoWriteClient.ts), já que a Auvo só era consultada
// por GET neste projeto até agora.
//
// Configurar antes do primeiro uso (mesmas credenciais já usadas por
// "operation" — não é uma segunda integração, é a mesma Auvo):
//   supabase functions deploy preparations
import { getServiceClient } from "./shared/db.ts";
import { route } from "./router.ts";

Deno.serve(async (req) => {
  const db = getServiceClient();
  return route(req, db);
});
