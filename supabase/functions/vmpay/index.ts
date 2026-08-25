// Módulo Telemetria — monitoramento de máquinas VMpay sem doses recentes.
// Nenhuma credencial aqui: token isolado em integrations/vmpay.config.ts,
// lido só de env var. Nenhuma venda é persistida — o snapshot cacheado
// (operational_snapshot_cache) guarda só o resultado já cruzado e
// classificado, nunca o histórico de vendas em si.
//
// Configurar antes do primeiro uso:
//   supabase secrets set VMPAY_ACCESS_TOKEN=<token> VMPAY_BASE_URL=<url>
//   supabase functions deploy vmpay

import { getServiceClient } from "./shared/db.ts";
import { route } from "./router.ts";

Deno.serve(async (req) => {
  const db = getServiceClient();
  return route(req, db);
});
