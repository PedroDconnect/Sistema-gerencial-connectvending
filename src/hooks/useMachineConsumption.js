import { useMemo } from "react";
import { fetchOperation } from "../lib/operationApi";
import { useCachedResource } from "./useCachedResource";

// Pedido explícito: reconsulta sozinho a cada 10 min, e mostra o último
// resultado bom (localStorage) ao reabrir a página em vez de esperar rede.
const AUTO_REFRESH_MS = 10 * 60 * 1000;

export function useMachineConsumption(auvoEquipmentId, params) {
  const key = JSON.stringify(params);
  const cacheKey = `painel-gerencial:machine-consumption:${auvoEquipmentId}:${key}`;
  // key (não params) na dependência: params é um objeto novo a cada
  // render de quem chama, mas o conteúdo (mesmo equipamento + mesmo
  // período) é o que importa pra decidir se refaz o fetcher — mesmo
  // padrão já usado em useOperacaoBreakdown.js e afins (warning esperado).
  const fetcher = useMemo(() => () => fetchOperation(`/machines/${auvoEquipmentId}/consumption`, params), [auvoEquipmentId, key]);

  return useCachedResource(cacheKey, fetcher, {
    autoRefreshMs: AUTO_REFRESH_MS,
    enabled: Boolean(auvoEquipmentId),
  });
}
