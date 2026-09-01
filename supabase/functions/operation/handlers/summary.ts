import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuvoProvider } from "../integrations/auvo/auvo.provider.ts";
import { parseTaskFilters } from "../service/filters.ts";
import { getQuickTotal } from "../service/operationService.ts";
import { jsonResponse } from "../shared/http.ts";

// Rápido de propósito: só o total do período (sem status, o único filtro
// que a Auvo não aceita de forma confiável — ver operationService.ts). O
// resto dos KPIs e os agrupamentos vêm de /details, que é lento porque
// precisa buscar as tarefas de verdade.
export async function handleSummary(db: SupabaseClient, url: URL): Promise<Response> {
  const filters = parseTaskFilters(url.searchParams);
  const provider = createAuvoProvider(db);
  const result = await getQuickTotal(db, provider, filters);
  return jsonResponse(result);
}
