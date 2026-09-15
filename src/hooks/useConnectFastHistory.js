import { useCallback, useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

// Mesmo padrão de useOperacaoDetails.js/useOperacaoTasks.js — só apontando
// pros endpoints novos (/history/summary, /history/tasks) que leem
// auvo_tasks_history em vez de consultar a Auvo ao vivo.
export function useConnectFastHistorySummary(params) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation("/history/summary", params)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}

export function useConnectFastHistoryTasks(params) {
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation("/history/tasks", params)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, items: data?.items ?? [], total: data?.total ?? 0 });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, items: [], total: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
