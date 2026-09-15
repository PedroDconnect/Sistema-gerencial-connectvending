import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseHistoryFilters, parseHistoryPagination } from "../service/historyFilters.ts";
import { jsonResponse, ControlledError } from "../shared/http.ts";

// Mesma sanitização de assetsQueryService.ts (sanitizeSearchTerm) — só
// tira vírgula/parênteses, que quebrariam a sintaxe do .or() do PostgREST.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, " ").trim();
}

export async function handleHistoryTasks(db: SupabaseClient, url: URL): Promise<Response> {
  const filters = parseHistoryFilters(url.searchParams);
  const { page, pageSize } = parseHistoryPagination(url.searchParams);

  let query = db
    .from("auvo_tasks_history")
    .select("auvo_task_id, task_date, task_type_name, customer_name, technician_name, status, finished, task_url", {
      count: "exact",
    })
    .gte("task_date", filters.dateFrom)
    .lte("task_date", filters.dateTo);

  if (filters.type) query = query.eq("task_type_name", filters.type);
  if (filters.technician) query = query.eq("technician_name", filters.technician);
  if (filters.status !== undefined) query = query.eq("status", filters.status);
  if (filters.search) {
    const term = sanitizeSearchTerm(filters.search);
    // Busca puramente numérica também tenta bater o número da O.S. exato,
    // além do ilike normal em cliente/técnico.
    const asId = /^\d+$/.test(term) ? Number(term) : null;
    query =
      asId !== null
        ? query.or(`auvo_task_id.eq.${asId},customer_name.ilike.%${term}%,technician_name.ilike.%${term}%`)
        : query.or(`customer_name.ilike.%${term}%,technician_name.ilike.%${term}%`);
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.order("task_date", { ascending: false }).range(from, from + pageSize - 1);

  if (error) throw new ControlledError(`Falha ao consultar o histórico de tarefas: ${error.message}`, 502);

  return jsonResponse({ items: data ?? [], total: count ?? 0, page, pageSize });
}
