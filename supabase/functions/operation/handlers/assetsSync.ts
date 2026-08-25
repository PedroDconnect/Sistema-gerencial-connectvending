import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshAssetsSnapshot } from "../service/assetsSyncService.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleAssetsSync(db: SupabaseClient): Promise<Response> {
  const meta = await ensureFreshAssetsSnapshot(db, { force: true });
  return jsonResponse(meta);
}
