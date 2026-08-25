import { useCallback, useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

// Painel gerencial por cliente (consumo VMpay + chamados Auvo filtrados) —
// carregado separado do resto do drawer, que já é instantâneo (Postgres
// só) — este cruza uma API externa (Auvo) e pode demorar mais. params
// (period/start_date/end_date) deixa o período configurável — sem eles,
// o backend usa o default de 90 dias.
export function useCustomerPanel(auvoCustomerId, params = {}) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    if (!auvoCustomerId) return undefined;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation(`/customers/${auvoCustomerId}/panel`, params)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [auvoCustomerId, key]);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
