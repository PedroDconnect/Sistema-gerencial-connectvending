import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "./http.ts";

// Espelha ASSIGNABLE_MODULE_IDS (admin/shared/auth.ts) e ASSIGNABLE_MODULES
// (src/data/mockData.js) — mantido em sincronia manual, mesma convenção já
// documentada nesses dois arquivos (Deno não importa o outro módulo).
const MODULE_ID = "preparacoes";

export interface CallerInfo {
  id: string;
  email: string | null;
  name: string | null;
  isAdmin: boolean;
}

// Mesmo fallback de src/components/Header.jsx#greetingName: nome vem do
// user_metadata quando existe (full_name/name), senão null — nunca inventa
// um nome pra auditoria (spec seção 16 pede "quem criou: nome, e-mail").
function resolveName(userMetadata: Record<string, unknown> | undefined | null): string | null {
  const full = userMetadata?.full_name ?? userMetadata?.name;
  return typeof full === "string" && full.trim() ? full.trim() : null;
}

// Mesma regra "grandfather" de admin/shared/auth.ts e do frontend
// (AuthContext.jsx): conta sem app_metadata.role definido é anterior à
// feature de papéis/módulos — tratada como admin com acesso total, pra
// nunca trancar quem já usava o painel.
function resolveIsAdmin(appMetadata: Record<string, unknown> | undefined | null): boolean {
  const role = appMetadata?.role;
  if (typeof role !== "string") return true;
  return role === "admin";
}

function hasModuleAccess(appMetadata: Record<string, unknown> | undefined | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const modules = appMetadata?.modules;
  if (!Array.isArray(modules)) return true; // grandfathered — mesmo raciocínio de isAdmin acima
  return modules.includes(MODULE_ID);
}

async function resolveCaller(
  db: SupabaseClient,
  req: Request
): Promise<{ caller: CallerInfo; appMetadata: Record<string, unknown> | null }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ControlledError("Sessão não encontrada.", 401);

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new ControlledError("Sessão inválida ou expirada.", 401);

  const appMetadata = (data.user.app_metadata as Record<string, unknown> | undefined) ?? null;
  const userMetadata = (data.user.user_metadata as Record<string, unknown> | undefined) ?? null;
  const isAdmin = resolveIsAdmin(appMetadata);
  return {
    caller: { id: data.user.id, email: data.user.email ?? null, name: resolveName(userMetadata), isAdmin },
    appMetadata,
  };
}

// Endpoints normais do módulo (pedidos/fichas/busca de cliente) —
// qualquer usuário com o módulo "preparacoes" liberado, ou admin (que
// sempre tem acesso total a tudo).
export async function requireModuleAccess(db: SupabaseClient, req: Request): Promise<CallerInfo> {
  const { caller, appMetadata } = await resolveCaller(db, req);
  if (!hasModuleAccess(appMetadata, caller.isAdmin)) {
    throw new ControlledError("Você não tem acesso a este módulo.", 403);
  }
  return caller;
}

// Configuração do template da ficha (spec seção 6) — só admin, mesmo
// padrão de admin/shared/auth.ts requireAdmin.
export async function requireAdmin(db: SupabaseClient, req: Request): Promise<CallerInfo> {
  const { caller } = await resolveCaller(db, req);
  if (!caller.isAdmin) {
    throw new ControlledError("Só administradores podem configurar a ficha de preparação.", 403);
  }
  return caller;
}
