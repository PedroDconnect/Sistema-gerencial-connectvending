import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, ControlledError, jsonResponse } from "./shared/http.ts";
import { requireAdmin } from "./shared/auth.ts";
import { listUsers, createUser, updateUser, deleteUser } from "./service/usersService.ts";

// Mesmo padrão de operation/router.ts: Supabase casa só o primeiro
// segmento ("admin") com esta function, o resto sobra em req.url pra
// gente rotear aqui dentro. Todo endpoint exige admin (ver
// shared/auth.ts) — nunca uma rota de leitura solta sem checagem.
export async function route(req: Request, db: SupabaseClient): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const adminIndex = segments.lastIndexOf("admin");
    const subPath = adminIndex >= 0 ? segments.slice(adminIndex + 1) : segments;

    const caller = await requireAdmin(db, req);

    if (subPath[0] === "users" && !subPath[1]) {
      if (req.method === "GET") return jsonResponse({ items: await listUsers(db) });
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        return jsonResponse(await createUser(db, body));
      }
    }

    if (subPath[0] === "users" && subPath[1]) {
      const userId = subPath[1];
      if (req.method === "PATCH") {
        const body = await req.json().catch(() => ({}));
        return jsonResponse(await updateUser(db, userId, body));
      }
      if (req.method === "DELETE") {
        await deleteUser(db, userId, caller.id);
        return jsonResponse({ ok: true });
      }
    }

    throw new ControlledError("Rota não encontrada.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
