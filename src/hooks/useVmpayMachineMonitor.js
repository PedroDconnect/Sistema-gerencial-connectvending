import { fetchVmpay } from "../lib/vmpayApi";
import { useCachedResource } from "./useCachedResource";

// Alinhado ao VMPAY_CACHE_TTL_SECONDS padrão do backend (300s) — não tem
// como ler o valor configurado de dentro do frontend, então usa o mesmo
// default sugerido no pedido. Repetir antes disso só bate no cache mesmo.
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function fetchSnapshot(force) {
  return fetchVmpay("/machine-monitor", force ? { refresh: 1 } : {});
}

export function useVmpayMachineMonitor() {
  return useCachedResource("painel-gerencial:machine-monitor", fetchSnapshot, { autoRefreshMs: AUTO_REFRESH_MS });
}
