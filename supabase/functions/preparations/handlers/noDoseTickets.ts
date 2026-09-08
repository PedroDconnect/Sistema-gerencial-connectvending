import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse, ControlledError } from "../shared/http.ts";
import { CallerInfo } from "../shared/auth.ts";
import { createNoDoseTickets, NoDoseMachineInput } from "../service/noDoseTicketsService.ts";

export async function handleCreateNoDoseTickets(db: SupabaseClient, caller: CallerInfo, req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new ControlledError("Corpo da requisição inválido.", 400);
  const requestTypeId = Number((body as Record<string, unknown>).requestTypeId);
  const machines = Array.isArray((body as Record<string, unknown>).machines)
    ? ((body as Record<string, unknown>).machines as NoDoseMachineInput[])
    : [];
  const results = await createNoDoseTickets(db, caller, requestTypeId, machines);
  return jsonResponse({ items: results });
}
