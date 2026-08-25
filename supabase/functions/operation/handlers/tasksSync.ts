import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshAuvoTasks } from "../service/auvoTasksSyncService.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleTasksSync(db: SupabaseClient): Promise<Response> {
  const meta = await ensureFreshAuvoTasks(db, { force: true });
  return jsonResponse(meta);
}
