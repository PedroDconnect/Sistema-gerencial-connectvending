import { useCallback, useEffect, useState } from "react";
import { fetchPreparationOrder } from "../lib/preparationsApi";

export function usePreparationOrder(orderId) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(() => {
    if (!orderId) return undefined;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchPreparationOrder(orderId)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
