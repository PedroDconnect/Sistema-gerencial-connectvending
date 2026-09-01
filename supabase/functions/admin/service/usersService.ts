import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";
import { ASSIGNABLE_MODULE_IDS, resolveIsAdmin } from "../shared/auth.ts";

export interface AdminUserRow {
  id: string;
  email: string | null;
  role: "admin" | "user";
  modules: string[];
  createdAt: string;
  lastSignInAt: string | null;
}

interface RawAuthUser {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
}

function normalizeUser(u: RawAuthUser): AdminUserRow {
  const meta = u.app_metadata ?? {};
  const modules = Array.isArray(meta.modules) ? (meta.modules as unknown[]).filter((m): m is string => typeof m === "string") : [];
  return {
    id: u.id,
    email: u.email ?? null,
    role: resolveIsAdmin(meta) ? "admin" : "user",
    modules,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
  };
}

// A base de usuários deste painel é a equipe interna (dezenas, não
// milhares) — 1 página de 200 cobre com folga sem precisar paginar de
// verdade aqui.
export async function listUsers(db: SupabaseClient): Promise<AdminUserRow[]> {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new ControlledError(`Falha ao listar usuários: ${error.message}`, 502);
  return (data?.users ?? [])
    .map((u) => normalizeUser(u as RawAuthUser))
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
}

// Nunca persiste um id de módulo desconhecido — se o frontend (ou uma
// chamada direta à API) mandar algo fora de ASSIGNABLE_MODULE_IDS, é
// descartado aqui, silenciosamente, em vez de guardar lixo em
// app_metadata que ninguém nunca vai conseguir conceder de volta pela
// tela.
function validateModules(modules: unknown): string[] {
  if (!Array.isArray(modules)) return [];
  const filtered = modules.filter((m): m is string => typeof m === "string" && ASSIGNABLE_MODULE_IDS.has(m));
  return Array.from(new Set(filtered));
}

export async function createUser(
  db: SupabaseClient,
  input: { email?: unknown; password?: unknown; role?: unknown; modules?: unknown }
): Promise<AdminUserRow> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email) throw new ControlledError("Email é obrigatório.", 400);

  const password = typeof input.password === "string" ? input.password : "";
  if (password.length < 6) throw new ControlledError("Senha precisa de pelo menos 6 caracteres.", 400);

  const role = input.role === "admin" ? "admin" : "user";
  const modules = validateModules(input.modules);

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role, modules },
  });
  if (error) throw new ControlledError(`Falha ao criar usuário: ${error.message}`, 502);
  return normalizeUser(data.user as RawAuthUser);
}

export async function updateUser(
  db: SupabaseClient,
  userId: string,
  input: { role?: unknown; modules?: unknown }
): Promise<AdminUserRow> {
  const { data: existing, error: fetchError } = await db.auth.admin.getUserById(userId);
  if (fetchError || !existing?.user) throw new ControlledError("Usuário não encontrado.", 404);

  const currentMeta = (existing.user.app_metadata ?? {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = { ...currentMeta };
  if (input.role !== undefined) nextMeta.role = input.role === "admin" ? "admin" : "user";
  if (input.modules !== undefined) nextMeta.modules = validateModules(input.modules);

  const { data, error } = await db.auth.admin.updateUserById(userId, { app_metadata: nextMeta });
  if (error) throw new ControlledError(`Falha ao atualizar usuário: ${error.message}`, 502);
  return normalizeUser(data.user as RawAuthUser);
}

export async function deleteUser(db: SupabaseClient, userId: string, callerId: string): Promise<void> {
  // Nunca deixa o próprio admin logado se auto-remover por aqui — evita
  // um "todo mundo trancado fora" por engano de clique.
  if (userId === callerId) {
    throw new ControlledError("Você não pode remover sua própria conta por aqui.", 400);
  }
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new ControlledError(`Falha ao remover usuário: ${error.message}`, 502);
}
