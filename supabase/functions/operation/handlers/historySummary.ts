import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseHistoryFilters } from "../service/historyFilters.ts";
import { jsonResponse, ControlledError } from "../shared/http.ts";

// Lê a view agregada (auvo_tasks_history_daily_by_type, ver schema.sql) em
// vez de somar linha a linha aqui — PostgREST não faz GROUP BY arbitrário,
// então a agregação já vem pronta do Postgres.
export async function handleHistorySummary(db: SupabaseClient, url: URL): Promise<Response> {
  const { dateFrom, dateTo } = parseHistoryFilters(url.searchParams);

  const { data, error } = await db
    .from("auvo_tasks_history_daily_by_type")
    .select("task_date, task_type_name, total")
    .gte("task_date", dateFrom)
    .lte("task_date", dateTo)
    .order("task_date", { ascending: true });

  if (error) throw new ControlledError(`Falha ao consultar o resumo do histórico: ${error.message}`, 502);

  return jsonResponse({ dateFrom, dateTo, rows: data ?? [] });
}
