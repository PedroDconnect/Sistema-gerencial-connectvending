import { useMemo } from "react";
import { fetchOperation } from "../lib/operationApi";
import { useCachedResource } from "./useCachedResource";

// Painel gerencial por cliente (consumo VMpay + chamados Auvo filtrados).
// Pedido explícito: reconsulta sozinho a cada 10 min, e mostra o último
// resultado bom (localStorage) ao reabrir a página em vez de esperar rede.
const AUTO_REFRESH_MS = 10 * 60 * 1000;

export function useCustomerPanel(auvoCustomerId, params = {}) {
  const key = JSON.stringify(params);
  const cacheKey = `painel-gerencial:customer-panel:${auvoCustomerId}:${key}`;
  const fetcher = useMemo(() => () => fetchOperation(`/customers/${auvoCustomerId}/panel`, params), [auvoCustomerId, key]);

  return useCachedResource(cacheKey, fetcher, {
    autoRefreshMs: AUTO_REFRESH_MS,
    enabled: Boolean(auvoCustomerId),
  });
}
