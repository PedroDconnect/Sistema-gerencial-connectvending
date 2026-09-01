// Módulo Admin — gerenciar contas e quais módulos cada uma enxerga.
// Único módulo que fala com a Auth Admin API (createUser/listUsers/
// updateUserById/deleteUser), por isso precisa da service role em vez de
// repassar o papel de quem chama — e é exatamente por isso que todo
// endpoint exige, na entrada, que quem chama já seja admin (ver
// shared/auth.ts requireAdmin), a partir do próprio JWT do chamador,
// nunca confiando em nada vindo do corpo da requisição.
//
// Papel/módulos de cada conta ficam em app_metadata (só editável via
// service role, nunca pelo próprio usuário) — sem tabela nova no
// Postgres, sem migração.
//
// Configurar antes do primeiro uso:
//   supabase functions deploy admin
import { getServiceClient } from "./shared/db.ts";
import { route } from "./router.ts";

Deno.serve(async (req) => {
  const db = getServiceClient();
  return route(req, db);
});
