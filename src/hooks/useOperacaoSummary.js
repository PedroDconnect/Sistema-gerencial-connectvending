import { useCallback, useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

export function useOperacaoSummary(params) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation("/summary", params)
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
