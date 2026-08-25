import { useCallback, useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

const PATH_BY_KIND = {
  type: "/by-type",
  technician: "/by-technician",
  customer: "/by-customer",
};

export function useOperacaoBreakdown(kind, params) {
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const key = JSON.stringify(params);
  const path = PATH_BY_KIND[kind];

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation(path, params)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, items: data?.items ?? [] });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, items: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [path, key]);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
