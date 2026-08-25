import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuvoProvider } from "../integrations/auvo/auvo.provider.ts";
import { parseTaskFilters, parsePagination } from "../service/filters.ts";
import { getTasksPage } from "../service/operationService.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleTasks(db: SupabaseClient, url: URL): Promise<Response> {
  const filters = parseTaskFilters(url.searchParams);
  const { page, pageSize } = parsePagination(url.searchParams);
  const provider = createAuvoProvider(db);
  const result = await getTasksPage(provider, { ...filters, page, pageSize });
  return jsonResponse(result);
}
