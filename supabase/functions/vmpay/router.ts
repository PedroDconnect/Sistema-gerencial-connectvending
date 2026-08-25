import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, ControlledError } from "./shared/http.ts";
import { handleMachineMonitor } from "./handlers/machineMonitor.ts";
import { handleHealth } from "./handlers/health.ts";
import { handleRegistrySync } from "./handlers/registrySync.ts";
import { handleSalesSync } from "./handlers/salesSync.ts";

// Mesmo padrão de operation/router.ts: Supabase casa só o primeiro
// segmento do path ("vmpay") com esta function; o resto sobra em req.url.
export async function route(req: Request, db: SupabaseClient): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const vmpayIndex = segments.lastIndexOf("vmpay");
    const subPath = vmpayIndex >= 0 ? segments.slice(vmpayIndex + 1) : segments;

    // Únicas rotas não-GET desta function: disparam o cruzamento Auvo ×
    // VMpay e a sincronização de vendas sob demanda (mesmo ajuste já
    // feito em operation/router.ts pro /assets-sync).
    if (subPath[0] === "registry-sync") {
      if (req.method !== "POST") throw new ControlledError("Método não suportado.", 405);
      return await handleRegistrySync(db);
    }
    if (subPath[0] === "sales-sync") {
      if (req.method !== "POST") throw new ControlledError("Método não suportado.", 405);
      return await handleSalesSync(db);
    }

    if (req.method !== "GET") {
      throw new ControlledError("Método não suportado.", 405);
    }

    if (subPath[0] === "machine-monitor") return await handleMachineMonitor(db, url);
    if (subPath[0] === "health") return await handleHealth(db);

    throw new ControlledError("Rota não encontrada.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
