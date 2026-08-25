import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshRegistry } from "../service/registryService.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleRegistrySync(db: SupabaseClient): Promise<Response> {
  const meta = await ensureFreshRegistry(db, { force: true });
  return jsonResponse(meta);
}
