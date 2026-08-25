import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshSales } from "../service/salesSyncService.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleSalesSync(db: SupabaseClient): Promise<Response> {
  const meta = await ensureFreshSales(db, { force: true });
  return jsonResponse(meta);
}
