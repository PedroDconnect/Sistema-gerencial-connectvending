import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMachineMonitorSnapshot } from "../service/vmpayService.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleMachineMonitor(db: SupabaseClient, url: URL): Promise<Response> {
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const snapshot = await getMachineMonitorSnapshot(db, forceRefresh);
  return jsonResponse(snapshot);
}
