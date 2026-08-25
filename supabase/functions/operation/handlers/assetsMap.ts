import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshAssetsSnapshot } from "../service/assetsSyncService.ts";
import { listMapPoints, countAssetsWithoutMapLocation } from "../service/assetsQueryService.ts";
import { parseMapFilters } from "../service/assetsFilters.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleAssetsMap(db: SupabaseClient, url: URL): Promise<Response> {
  await ensureFreshAssetsSnapshot(db);
  const filters = parseMapFilters(url.searchParams);
  const [points, withoutLocation] = await Promise.all([
    listMapPoints(db, filters),
    countAssetsWithoutMapLocation(db, filters),
  ]);
  return jsonResponse({ items: points, withoutLocation });
}
