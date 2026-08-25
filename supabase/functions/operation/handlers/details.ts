import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuvoProvider } from "../integrations/auvo/auvo.provider.ts";
import { parseTaskFilters } from "../service/filters.ts";
import { getOverview } from "../service/operationService.ts";
import { jsonResponse } from "../shared/http.ts";

// Lento de propósito: busca as tarefas reais do período (única forma
// confiável de contar por status na Auvo — ver operationService.ts) e
// agrega de 4 formas (status, tipo, técnico, cliente×tipo) numa única
// passada, pra não repetir a busca cara por endpoint.
export async function handleDetails(db: SupabaseClient, url: URL): Promise<Response> {
  const filters = parseTaskFilters(url.searchParams);
  const provider = createAuvoProvider(db);
  const result = await getOverview(provider, filters);
  return jsonResponse(result);
}
