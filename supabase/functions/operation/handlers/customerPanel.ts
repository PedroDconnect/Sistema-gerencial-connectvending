import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCustomerConsumption, readSyncStatus } from "../service/consumptionQueryService.ts";
import { getCustomerTasks } from "../service/customerTasksService.ts";
import { parseCustomerPanelDateRange } from "../service/consumptionFilters.ts";
import { jsonResponse, ControlledError } from "../shared/http.ts";

// Um cliente por vez, sempre — nunca chamado em lote (seção de
// performance pedida: "sempre filtrando apenas um cliente por vez").
// Consumo e chamados são as duas leituras (Postgres, já sincronizados em
// segundo plano — ver assetsSyncService/salesSyncService/
// auvoTasksSyncService) — nenhum dos dois bate numa API externa na hora
// do clique, por isso podem rodar em paralelo sem se preocupar com carga
// na Auvo/VMpay.
export async function handleCustomerPanel(db: SupabaseClient, auvoCustomerIdRaw: string, url: URL): Promise<Response> {
  const auvoCustomerId = Number(auvoCustomerIdRaw);
  if (!Number.isFinite(auvoCustomerId)) throw new ControlledError("ID de cliente inválido.", 400);

  const { startDate, endDate } = parseCustomerPanelDateRange(url.searchParams);

  const [consumption, tasks, tasksSync] = await Promise.all([
    getCustomerConsumption(db, auvoCustomerId, { startDate, endDate }),
    getCustomerTasks(db, auvoCustomerId, { dateFrom: startDate, dateTo: endDate }),
    readSyncStatus(db, "auvo_tasks_sync", "status", "error"),
  ]);

  return jsonResponse({
    startDate,
    endDate,
    consumption,
    tasks: {
      ...tasks,
      dateFrom: startDate,
      dateTo: endDate,
      tasksSyncedAt: tasksSync.syncedAt,
      tasksSyncStatus: tasksSync.status,
    },
  });
}
