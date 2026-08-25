import { useCallback, useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

export function useOperacaoCompletaOverview() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation("/overview")
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!cancelled) setState((prev) => ({ loading: false, error, data: prev.data }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
