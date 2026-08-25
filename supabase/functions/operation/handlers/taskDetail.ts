import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuvoProvider } from "../integrations/auvo/auvo.provider.ts";
import { jsonResponse, ControlledError } from "../shared/http.ts";

export async function handleTaskDetail(db: SupabaseClient, id: string): Promise<Response> {
  const taskId = Number(id);
  if (!Number.isFinite(taskId) || taskId <= 0) {
    throw new ControlledError("ID de tarefa inválido.", 400);
  }

  const provider = createAuvoProvider(db);
  const task = await provider.getTask(taskId);
  if (!task) {
    return jsonResponse({ error: "Tarefa não encontrada." }, 404);
  }
  return jsonResponse(task);
}
