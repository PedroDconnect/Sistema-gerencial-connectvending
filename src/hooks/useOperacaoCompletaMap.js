import { useCallback, useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

export function useOperacaoCompletaMap(params) {
  const [state, setState] = useState({ loading: true, error: null, items: [], withoutLocation: 0 });
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation("/map", params)
      .then((data) => {
        if (!cancelled) {
          setState({ loading: false, error: null, items: data?.items ?? [], withoutLocation: data?.withoutLocation ?? 0 });
        }
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, items: [], withoutLocation: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
