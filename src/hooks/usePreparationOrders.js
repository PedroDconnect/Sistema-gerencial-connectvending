import { useCallback, useEffect, useState } from "react";
import { fetchPreparationOrders } from "../lib/preparationsApi";

// Mesmo padrão de useAdminUsers.js — lista paginada (page/pageSize
// controlados por quem chama, refetch reaproveita os últimos usados).
export function usePreparationOrders(page = 1, pageSize = 20) {
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchPreparationOrders(page, pageSize)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, items: data?.items ?? [], total: data?.total ?? 0 });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, items: [], total: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [page, pageSize]);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
