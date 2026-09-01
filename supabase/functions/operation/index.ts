// Módulo Operação — camada executiva sobre APIs de campo, começando pela
// Auvo. Nenhuma credencial ou Bearer token aqui: tudo isolado em
// integrations/auvo/. Cada request consulta a Auvo com dois níveis de
// cache: um técnico curto em memória, só pra deduplicar chamadas
// idênticas em poucos segundos (ver shared/cache.ts), e um persistido em
// Postgres (ver fetchTasksPersisted em service/operationService.ts,
// decisão de 01/09/2026) — Abastecimento Rotina sozinho passa de 900
// tarefas/dia e não completa de forma confiável 100% ao vivo quando a
// Auvo está instável, então o resultado da busca fica salvo por até 15
// min (renovado a cada leitura enquanto alguém continuar olhando).
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
