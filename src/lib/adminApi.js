import { supabase, isSupabaseConfigured } from "./supabaseClient";

const FUNCTIONS_BASE = isSupabaseConfigured
  ? `${import.meta.env.VITE_SUPABASE_FRONTEND_URL}/functions/v1/admin`
  : null;

// Mesmo padrão de operationApi.js/vmpayApi.js: fetch direto (não
// supabase.functions.invoke) pra poder anexar método/corpo sem depender
// de como cada versão do client resolve isso.
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_FRONTEND_ANON_KEY;
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_FRONTEND_ANON_KEY,
    "Content-Type": "application/json",
  };
}

async function request(path, options = {}) {
  if (!FUNCTIONS_BASE) throw new Error("Supabase não configurado.");

  const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
    ...options,
    headers: await authHeaders(),
  });
  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(payload?.error ?? "Não foi possível completar a operação.");
  }
  return payload;
}

export function fetchAdminUsers() {
  return request("/users");
}

export function createAdminUser(input) {
  return request("/users", { method: "POST", body: JSON.stringify(input) });
}

export function updateAdminUser(id, input) {
  return request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteAdminUser(id) {
  return request(`/users/${id}`, { method: "DELETE" });
}
