import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../shared/http.ts";

export async function handleHealth(db: SupabaseClient): Promise<Response> {
  const { data } = await db
    .from("operational_snapshot_cache")
    .select("generated_at, data_incomplete, last_error, last_error_at")
    .eq("cache_key", "machine_monitor")
    .maybeSingle();

  return jsonResponse({
    provider: "vmpay",
    generatedAt: data?.generated_at ?? null,
    dataIncomplete: data?.data_incomplete ?? null,
    lastError: data?.last_error ?? null,
    lastErrorAt: data?.last_error_at ?? null,
  });
}
