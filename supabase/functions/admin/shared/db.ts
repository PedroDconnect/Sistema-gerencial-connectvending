import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let client: SupabaseClient | null = null;

// Auth Admin API (createUser/listUsers/updateUserById/deleteUser) só
// funciona com a service role key — é a própria Supabase que exige isso,
// não escolha nossa. Sem ela, toda chamada de auth.admin.* falha.
export function getServiceClient(): SupabaseClient {
  if (client) return client;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não disponíveis — a Edge Function precisa da service role pra usar a Auth Admin API."
    );
  }

  client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return client;
}
