import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";
import { CUSTOMER_PANEL_TASK_TYPES } from "./auvoTasksSyncService.ts";

export interface CustomerTaskItem {
  id: number;
  taskTypeName: string;
  technicianName: string | null;
  taskDate: string | null;
  status: number | null;
  finished: boolean;
  taskUrl: string | null;
}

export interface CustomerTasksResult {
  items: CustomerTaskItem[];
  byType: Array<{ taskTypeName: string; total: number; finished: number }>;
}

// Lê o cache já sincronizado (auvo_tasks_cache, ver auvoTasksSyncService.ts)
// — nunca chama a Auvo ao vivo aqui. Antes disso chamava a Auvo por
// cliente a cada clique do drawer; a Auvo tem dias instáveis (mesmo
// comportamento já visto na auditoria geral de tarefas) e isso deixava
// "Chamados" sem carregar. Consulta indexada (customer_id, task_date) —
// sempre rápida, independente do estado da Auvo no momento.
export async function getCustomerTasks(
  db: SupabaseClient,
  customerId: number,
  { dateFrom, dateTo }: { dateFrom: string; dateTo: string }
): Promise<CustomerTasksResult> {
  const { data, error } = await db
    .from("auvo_tasks_cache")
    .select("auvo_task_id, task_type_name, technician_name, task_date, status, finished, task_url")
    .eq("customer_id", customerId)
    .gte("task_date", `${dateFrom}T00:00:00.000Z`)
    .lte("task_date", `${dateTo}T23:59:59.999Z`)
    .order("task_date", { ascending: false });
  if (error) throw new ControlledError(`Falha ao consultar chamados do cliente: ${error.message}`, 502);

  const items: CustomerTaskItem[] = (data ?? []).map((r) => ({
    id: r.auvo_task_id as number,
    taskTypeName: r.task_type_name as string,
    technicianName: (r.technician_name as string) ?? null,
    taskDate: (r.task_date as string) ?? null,
    status: (r.status as number) ?? null,
    finished: r.finished === true,
    taskUrl: (r.task_url as string) ?? null,
  }));

  const byTypeMap = new Map(CUSTOMER_PANEL_TASK_TYPES.map((t) => [t, { total: 0, finished: 0 }]));
  for (const item of items) {
    const entry = byTypeMap.get(item.taskTypeName);
    if (!entry) continue;
    entry.total += 1;
    if (item.finished) entry.finished += 1;
  }

  return {
    items,
    byType: Array.from(byTypeMap.entries()).map(([taskTypeName, v]) => ({ taskTypeName, ...v })),
  };
}
