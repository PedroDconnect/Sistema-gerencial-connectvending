import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuvoProvider } from "../integrations/auvo/auvo.provider.ts";
import { jsonResponse } from "../shared/http.ts";

export async function handleHealth(db: SupabaseClient): Promise<Response> {
  const provider = createAuvoProvider(db);
  const health = await provider.health();
  return jsonResponse(health);
}
