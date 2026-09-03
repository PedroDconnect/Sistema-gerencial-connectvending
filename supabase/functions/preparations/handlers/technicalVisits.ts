import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse, ControlledError } from "../shared/http.ts";
import { CallerInfo } from "../shared/auth.ts";
import { getTicketRequestTypes, createTechnicalVisit } from "../service/technicalVisitsService.ts";

export async function handleListRequestTypes(db: SupabaseClient): Promise<Response> {
  return jsonResponse({ items: await getTicketRequestTypes(db) });
}

export async function handleCreateTechnicalVisit(db: SupabaseClient, caller: CallerInfo, req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new ControlledError("Corpo da requisição inválido.", 400);
  const result = await createTechnicalVisit(db, caller, body);
  return jsonResponse(result, 201);
}
