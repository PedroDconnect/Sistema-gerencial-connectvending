import { supabase, isSupabaseConfigured } from "./supabaseClient";

const FUNCTIONS_BASE = isSupabaseConfigured ? `${import.meta.env.VITE_SUPABASE_FRONTEND_URL}/functions/v1/vmpay` : null;

// Mesmo padrão de operationApi.js: fetch direto (não supabase.functions.invoke)
// pra poder anexar sub-caminho + query string sem depender de como cada
// versão do client resolve isso. O access_token da VMpay nunca passa por
// aqui — fica só no backend (integrations/vmpay.config.ts).
export async function fetchVmpay(path, params = {}) {
  if (!FUNCTIONS_BASE) {
    throw new Error("Supabase não configurado.");
  }

  const url = new URL(`${FUNCTIONS_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_FRONTEND_ANON_KEY;

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_FRONTEND_ANON_KEY,
    },
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(payload?.error ?? "Não foi possível atualizar os dados de telemetria.");
  }

  return payload;
}

// Mesma autenticação de fetchVmpay, só que POST e sem query string — usado
// pelo botão "Atualizar dados" da Operação Completa pra disparar o
// cruzamento Auvo × VMpay e a sincronização de vendas.
export async function postVmpay(path) {
  if (!FUNCTIONS_BASE) {
    throw new Error("Supabase não configurado.");
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_FRONTEND_ANON_KEY;

  const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_FRONTEND_ANON_KEY,
    },
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(payload?.error ?? "Não foi possível sincronizar os dados de telemetria.");
  }

  return payload;
}
