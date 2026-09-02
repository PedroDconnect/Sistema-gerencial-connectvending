import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, ControlledError } from "./shared/http.ts";
import { requireModuleAccess, requireAdmin } from "./shared/auth.ts";
import { handleListOrders, handleGetOrder, handleCreateOrder, handleRetryForm, handleRegenerateDocument, handleSyncOrder } from "./handlers/orders.ts";
import { handleSearchCustomers, handleCreateCustomer } from "./handlers/customers.ts";
import { handleGetActiveTemplate, handleListTemplateVersions, handleCreateTemplateVersion } from "./handlers/templates.ts";
import { handleGetFormDocument } from "./handlers/documents.ts";

// Mesmo padrão de dispatch manual de admin/router.ts e operation/router.ts:
// Supabase casa só o primeiro segmento ("preparations") com esta function,
// o resto sobra em req.url pra rotear aqui dentro.
export async function route(req: Request, db: SupabaseClient): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const moduleIndex = segments.lastIndexOf("preparations");
    const subPath = moduleIndex >= 0 ? segments.slice(moduleIndex + 1) : segments;

    // Configuração do template (spec seção 6) — só admin, checado antes de
    // qualquer coisa pra nunca vazar uma rota de config por engano.
    if (subPath[0] === "admin" && subPath[1] === "templates") {
      const caller = await requireAdmin(db, req);
      if (req.method === "GET") return await handleListTemplateVersions(db);
      if (req.method === "POST") return await handleCreateTemplateVersion(db, caller, req);
      throw new ControlledError("Método não suportado.", 405);
    }

    // Todo o resto exige só o módulo "preparacoes" liberado (ou admin,
    // que sempre tem acesso total).
    const caller = await requireModuleAccess(db, req);

    if (subPath[0] === "templates" && subPath[1] === "active" && req.method === "GET") {
      return await handleGetActiveTemplate(db);
    }

    if (subPath[0] === "customers" && !subPath[1]) {
      if (req.method === "GET") return await handleSearchCustomers(db, url);
      if (req.method === "POST") return await handleCreateCustomer(db, req);
    }

    if (subPath[0] && subPath[1] === "forms" && subPath[2] && subPath[3] === "send") {
      if (req.method !== "POST") throw new ControlledError("Método não suportado.", 405);
      return await handleRetryForm(db, caller, subPath[0], subPath[2]);
    }
    if (subPath[0] && subPath[1] === "forms" && subPath[2] && subPath[3] === "regenerate-document") {
      if (req.method !== "POST") throw new ControlledError("Método não suportado.", 405);
      return await handleRegenerateDocument(db, caller, subPath[0], subPath[2], req);
    }
    if (subPath[0] && subPath[1] === "forms" && subPath[2] && subPath[3] === "document") {
      if (req.method !== "GET") throw new ControlledError("Método não suportado.", 405);
      return await handleGetFormDocument(db, subPath[0], subPath[2]);
    }
    if (subPath[0] && subPath[1] === "sync-auvo") {
      if (req.method !== "POST") throw new ControlledError("Método não suportado.", 405);
      return await handleSyncOrder(db, caller, subPath[0]);
    }

    if (subPath[0] && !subPath[1]) {
      if (req.method === "GET") return await handleGetOrder(db, subPath[0]);
    }

    if (!subPath[0]) {
      if (req.method === "GET") return await handleListOrders(db, url);
      if (req.method === "POST") return await handleCreateOrder(db, caller, req);
    }

    throw new ControlledError("Rota não encontrada.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
