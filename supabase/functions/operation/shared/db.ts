import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let client: SupabaseClient | null = null;

// integration_tokens/integration_events têm RLS habilitado sem nenhuma
// policy — só a service role acessa. Se este client fosse acidentalmente
// criado com a anon key, leituras voltariam vazias e escritas seriam
// rejeitadas em silêncio (RLS nega por padrão), então falhamos alto aqui
// em vez de deixar esse bug se disfarçar de "token nunca cacheado".
export function getServiceClient(): SupabaseClient {
  if (client) return client;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não disponíveis — a Edge Function precisa da service role para acessar integration_tokens/integration_events."
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return client;
}
