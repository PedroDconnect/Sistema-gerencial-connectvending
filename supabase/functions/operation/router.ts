import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, ControlledError } from "./shared/http.ts";
import { handleSummary } from "./handlers/summary.ts";
import { handleDetails } from "./handlers/details.ts";
import { handleByType } from "./handlers/byType.ts";
import { handleByTechnician } from "./handlers/byTechnician.ts";
import { handleByCustomer } from "./handlers/byCustomer.ts";
import { handleTasks } from "./handlers/tasks.ts";
import { handleTaskDetail } from "./handlers/taskDetail.ts";
import { handleHealth } from "./handlers/health.ts";
import { handleAssetsOverview } from "./handlers/assetsOverview.ts";
import { handleAssetsList, handleAssetDetail, handleAssetFilterOptions } from "./handlers/assetsList.ts";
import { handleCustomersList, handleCustomerDetail } from "./handlers/customersList.ts";
import { handleAssetsMap } from "./handlers/assetsMap.ts";
import { handleAssetsSync } from "./handlers/assetsSync.ts";
import { handleMachineConsumption } from "./handlers/machineConsumption.ts";
import { handleInconsistencies } from "./handlers/inconsistencies.ts";
import { handleCustomerPanel } from "./handlers/customerPanel.ts";
import { handleTasksSync } from "./handlers/tasksSync.ts";

// Supabase casa só o primeiro segmento do path ("operation") com esta
// function; o resto (/summary, /tasks/123, ...) sobra em req.url pra gente
// rotear aqui dentro — por isso um único deploy cobre todos os endpoints do
// módulo em vez de uma function separada por rota.
export async function route(req: Request, db: SupabaseClient): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const operationIndex = segments.lastIndexOf("operation");
    const subPath = operationIndex >= 0 ? segments.slice(operationIndex + 1) : segments;

    // Única rota que não é leitura: dispara a sincronização Auvo sob
    // demanda (botão "Atualizar dados"). Todo o resto do módulo continua
    // GET-only.
    if (subPath[0] === "assets-sync") {
      if (req.method !== "POST") throw new ControlledError("Método não suportado.", 405);
      return await handleAssetsSync(db);
    }
    if (subPath[0] === "tasks-sync") {
      if (req.method !== "POST") throw new ControlledError("Método não suportado.", 405);
      return await handleTasksSync(db);
    }

    if (req.method !== "GET") {
      throw new ControlledError("Método não suportado.", 405);
    }

    if (subPath[0] === "summary") return await handleSummary(db, url);
    if (subPath[0] === "details") return await handleDetails(db, url);
    if (subPath[0] === "by-type") return await handleByType(db, url);
    if (subPath[0] === "by-technician") return await handleByTechnician(db, url);
    if (subPath[0] === "by-customer") return await handleByCustomer(db, url);
    if (subPath[0] === "health") return await handleHealth(db);
    if (subPath[0] === "tasks" && subPath[1]) return await handleTaskDetail(db, subPath[1]);
    if (subPath[0] === "tasks") return await handleTasks(db, url);

    if (subPath[0] === "overview") return await handleAssetsOverview(db);
    if (subPath[0] === "assets" && subPath[1] === "filter-options") return await handleAssetFilterOptions(db);
    if (subPath[0] === "assets" && subPath[1]) return await handleAssetDetail(db, subPath[1]);
    if (subPath[0] === "assets") return await handleAssetsList(db, url);
    if (subPath[0] === "customers" && subPath[1] && subPath[2] === "panel") {
      return await handleCustomerPanel(db, subPath[1], url);
    }
    if (subPath[0] === "customers" && subPath[1]) return await handleCustomerDetail(db, subPath[1]);
    if (subPath[0] === "customers") return await handleCustomersList(db, url);
    if (subPath[0] === "map") return await handleAssetsMap(db, url);
    if (subPath[0] === "machines" && subPath[1] && subPath[2] === "consumption") {
      return await handleMachineConsumption(db, subPath[1], url);
    }
    if (subPath[0] === "inconsistencies") return await handleInconsistencies(db, url);

    throw new ControlledError("Rota não encontrada.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
