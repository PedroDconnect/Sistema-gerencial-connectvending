import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let client: SupabaseClient | null = null;

// preparation_* têm RLS habilitado sem nenhuma policy (ver schema.sql) —
// só a service role acessa. Mesmo motivo de admin/operation: se este
// client fosse criado com a anon key por engano, leitura voltaria vazia e
// escrita seria rejeitada em silêncio, então falha alto aqui em vez de
// deixar isso se disfarçar de bug em outro lugar.
export function getServiceClient(): SupabaseClient {
  if (client) return client;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não disponíveis — a Edge Function precisa da service role para acessar preparation_*."
    );
  }

  client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return client;
}
