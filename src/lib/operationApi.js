import { supabase, isSupabaseConfigured } from "./supabaseClient";

const FUNCTIONS_BASE = isSupabaseConfigured
  ? `${import.meta.env.VITE_SUPABASE_FRONTEND_URL}/functions/v1/operation`
  : null;

// A function "operation" resolve várias sub-rotas internamente
// (/summary, /tasks, /tasks/:id...) — supabase.functions.invoke() não tem
// um jeito confiável de anexar sub-caminho + query string entre versões,
// então falamos com ela por fetch direto, igual o restante da app fala
// com o Supabase: mesma anon key, e o token da sessão quando existe.
export async function fetchOperation(path, params = {}) {
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
    throw new Error(payload?.error ?? "Não foi possível atualizar os dados da operação.");
  }

  return payload;
}

// Mesma autenticação de fetchOperation, só que POST e sem query string —
// usado pelo botão "Atualizar dados" da Operação Completa (dispara sync,
// nunca fala com a Auvo direto do browser).
export async function postOperation(path) {
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
    throw new Error(payload?.error ?? "Não foi possível sincronizar os dados da operação.");
  }

  return payload;
}
