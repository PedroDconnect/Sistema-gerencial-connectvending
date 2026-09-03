import { supabase, isSupabaseConfigured } from "./supabaseClient";

const FUNCTIONS_BASE = isSupabaseConfigured
  ? `${import.meta.env.VITE_SUPABASE_FRONTEND_URL}/functions/v1/preparations`
  : null;

// Mesmo padrão de adminApi.js: fetch direto (não supabase.functions.invoke)
// pra poder anexar método/corpo/query string sem depender de como cada
// versão do client resolve isso.
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

export function fetchPreparationOrders(page = 1, pageSize = 20) {
  return request(`?page=${page}&pageSize=${pageSize}`);
}

export function fetchPreparationOrder(id) {
  return request(`/${id}`);
}

export function createPreparationOrder(input) {
  return request("", { method: "POST", body: JSON.stringify(input) });
}

export function retryPreparationForm(orderId, formId) {
  return request(`/${orderId}/forms/${formId}/send`, { method: "POST" });
}

export function regeneratePreparationDocument(orderId, formId, formData) {
  return request(`/${orderId}/forms/${formId}/regenerate-document`, {
    method: "POST",
    body: JSON.stringify(formData ? { formData } : {}),
  });
}

export function getPreparationFormDocumentUrl(orderId, formId) {
  return request(`/${orderId}/forms/${formId}/document`);
}

export function syncPreparationOrderWithAuvo(orderId) {
  return request(`/${orderId}/sync-auvo`, { method: "POST" });
}

export function searchPreparationCustomers(q) {
  return request(`/customers?q=${encodeURIComponent(q)}`);
}

export function createPreparationCustomer(input) {
  return request("/customers", { method: "POST", body: JSON.stringify(input) });
}

export function fetchActivePreparationTemplate() {
  return request("/templates/active");
}

export function fetchPreparationTemplateVersions() {
  return request("/admin/templates");
}

export function createPreparationTemplateVersion(fields) {
  return request("/admin/templates", { method: "POST", body: JSON.stringify({ fields }) });
}

// "Solicitar Visita Técnica" (spec 4.1) — ticket simples, sem ficha/PDF.
export function fetchTicketRequestTypes() {
  return request("/ticket-request-types");
}

export function createTechnicalVisit(input) {
  return request("/technical-visits", { method: "POST", body: JSON.stringify(input) });
}
