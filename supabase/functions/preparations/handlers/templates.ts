import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse, ControlledError } from "../shared/http.ts";
import { CallerInfo } from "../shared/auth.ts";
import { getActiveTemplate, listTemplateVersions, createTemplateVersion } from "../service/templatesService.ts";

export async function handleGetActiveTemplate(db: SupabaseClient): Promise<Response> {
  return jsonResponse(await getActiveTemplate(db));
}

export async function handleListTemplateVersions(db: SupabaseClient): Promise<Response> {
  return jsonResponse({ items: await listTemplateVersions(db) });
}

export async function handleCreateTemplateVersion(db: SupabaseClient, caller: CallerInfo, req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body?.fields) throw new ControlledError("Corpo da requisição precisa de \"fields\".", 400);
  const result = await createTemplateVersion(db, caller, body.fields);
  return jsonResponse(result, 201);
}
