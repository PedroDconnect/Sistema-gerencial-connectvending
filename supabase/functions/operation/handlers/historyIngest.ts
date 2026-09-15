import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse, ControlledError } from "../shared/http.ts";

interface IngestTaskRow {
  auvoTaskId: number;
  taskDate: string;
  taskTypeName: string;
  customerId?: number | null;
  customerName?: string | null;
  technicianId?: number | null;
  technicianName?: string | null;
  status?: number | null;
  finished?: boolean;
  taskUrl?: string | null;
}

const MAX_BATCH = 5000;

// Único endpoint de escrita que aceita payload arbitrário de um chamador
// externo (o pipeline Python em datalake/, fora do Supabase) — por isso é
// o único da função "operation" com uma checagem própria de token, em vez
// de confiar só na anon key da plataforma (ver nota em schema.sql e no
// plano: os outros endpoints são leitura ou não recebem corpo, esse grava
// no banco a partir do que o chamador manda).
export async function handleHistoryIngest(db: SupabaseClient, req: Request): Promise<Response> {
  const expectedToken = Deno.env.get("HISTORY_INGEST_TOKEN");
  if (!expectedToken) {
    throw new ControlledError("HISTORY_INGEST_TOKEN não configurado no servidor.", 500);
  }
  const givenToken = req.headers.get("X-Ingest-Token");
  if (givenToken !== expectedToken) {
    throw new ControlledError("Token de ingestão ausente ou inválido.", 401);
  }

  const body = await req.json().catch(() => null);
  const tasks = body?.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new ControlledError("Corpo precisa ser { tasks: [...] } com pelo menos 1 item.", 400);
  }
  if (tasks.length > MAX_BATCH) {
    throw new ControlledError(`Máximo de ${MAX_BATCH} tarefas por chamada — envie em lotes menores.`, 400);
  }

  const rows = (tasks as IngestTaskRow[]).map((t) => ({
    auvo_task_id: t.auvoTaskId,
    task_date: t.taskDate,
    task_type_name: t.taskTypeName,
    customer_id: t.customerId ?? null,
    customer_name: t.customerName ?? null,
    technician_id: t.technicianId ?? null,
    technician_name: t.technicianName ?? null,
    status: t.status ?? null,
    finished: Boolean(t.finished),
    task_url: t.taskUrl ?? null,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await db.from("auvo_tasks_history").upsert(rows, { onConflict: "auvo_task_id" });
  if (error) throw new ControlledError(`Falha ao gravar histórico: ${error.message}`, 502);

  return jsonResponse({ upserted: rows.length });
}
