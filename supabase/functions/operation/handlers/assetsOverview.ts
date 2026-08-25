import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshAssetsSnapshot } from "../service/assetsSyncService.ts";
import { getAssetsOverview } from "../service/assetsQueryService.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleAssetsOverview(db: SupabaseClient): Promise<Response> {
  const syncMeta = await ensureFreshAssetsSnapshot(db);
  const overview = await getAssetsOverview(db);

  return jsonResponse({
    ...overview,
    lastSyncedAt: syncMeta.syncFinishedAt,
    syncStatus: syncMeta.status,
    syncError: syncMeta.error,
  });
}
