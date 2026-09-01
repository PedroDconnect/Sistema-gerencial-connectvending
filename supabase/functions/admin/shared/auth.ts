import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "./http.ts";

// Lista de módulos concedíveis por usuário — espelha 1:1 os ids
// navegáveis de src/data/mockData.js (ASSIGNABLE_MODULES). Deno não
// importa código do app React, então mantido em sincronia manualmente;
// qualquer id fora desta lista é descartado ao salvar (ver
// service/usersService.ts), nunca persistido "no escuro".
export const ASSIGNABLE_MODULE_IDS = new Set([
  "overview",
  "clientes",
  "ativos",
  "operacao-chamados",
  "operacao-rotina",
  "telemetria",
  "operacao-completa",
  "logistica",
  "financeiro",
  "newbusiness",
  "posvenda",
]);

export interface CallerInfo {
  id: string;
  email: string | null;
}

// Mesma regra "grandfather" do frontend (ver AuthContext.jsx): uma conta
// sem app_metadata.role definido é anterior a essa feature (só existia
// uma, a de quem já usava o painel) — tratada como admin, pra nunca
// trancar quem já tinha acesso sem querer no dia em que isso foi
// implantado (01/09/2026).
export function resolveIsAdmin(appMetadata: Record<string, unknown> | undefined | null): boolean {
  const role = appMetadata?.role;
  if (typeof role !== "string") return true;
  return role === "admin";
}

// Verifica quem está chamando a partir do próprio JWT (nunca confia em
// nada vindo do corpo da requisição) — funciona mesmo com o client
// configurado com a service role, porque getUser(token) valida o token
// passado, não o papel do client em si.
export async function requireAdmin(db: SupabaseClient, req: Request): Promise<CallerInfo> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ControlledError("Sessão não encontrada.", 401);

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new ControlledError("Sessão inválida ou expirada.", 401);

  if (!resolveIsAdmin(data.user.app_metadata as Record<string, unknown> | undefined)) {
    throw new ControlledError("Só administradores podem gerenciar usuários.", 403);
  }

  return { id: data.user.id, email: data.user.email ?? null };
}
