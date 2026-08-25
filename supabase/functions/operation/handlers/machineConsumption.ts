import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMachineConsumption } from "../service/consumptionQueryService.ts";
import { parseConsumptionDateRange } from "../service/consumptionFilters.ts";
import { jsonResponse, ControlledError } from "../shared/http.ts";

export async function handleMachineConsumption(db: SupabaseClient, auvoEquipmentIdRaw: string, url: URL): Promise<Response> {
  const auvoEquipmentId = Number(auvoEquipmentIdRaw);
  if (!Number.isFinite(auvoEquipmentId)) throw new ControlledError("ID de equipamento inválido.", 400);

  const { startDate, endDate } = parseConsumptionDateRange(url.searchParams);
  const result = await getMachineConsumption(db, auvoEquipmentId, { startDate, endDate });
  return jsonResponse(result);
}
