import { useCallback, useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

export function useOperacaoCompletaAssets(params) {
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation("/assets", params)
      .then((data) => {
        if (!cancelled) {
          setState({ loading: false, error: null, items: data?.items ?? [], total: data?.total ?? 0 });
        }
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
