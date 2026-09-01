import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuvoProvider } from "../integrations/auvo/auvo.provider.ts";
import { parseTaskFilters } from "../service/filters.ts";
import { getByTechnician } from "../service/operationService.ts";
import { jsonResponse } from "../shared/http.ts";
import { getOrSet } from "../shared/cache.ts";

export async function handleByTechnician(db: SupabaseClient, url: URL): Promise<Response> {
  const filters = parseTaskFilters(url.searchParams);
  const provider = createAuvoProvider(db);
  const cacheKey = `by-technician:${JSON.stringify(filters)}`;
  const result = await getOrSet(cacheKey, 15_000, () => getByTechnician(db, provider, filters));
  return jsonResponse({ items: result });
}
