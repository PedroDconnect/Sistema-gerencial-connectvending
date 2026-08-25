import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRegistryInconsistencies } from "../service/consumptionQueryService.ts";
import { parseAssetsPagination } from "../service/assetsFilters.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleInconsistencies(db: SupabaseClient, url: URL): Promise<Response> {
  const { page, pageSize } = parseAssetsPagination(url.searchParams);
  const result = await getRegistryInconsistencies(db, page, pageSize);
  return jsonResponse(result);
}
