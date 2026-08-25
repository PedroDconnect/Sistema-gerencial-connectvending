import { useCallback, useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

export function useMachineConsumption(auvoEquipmentId, params) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    if (!auvoEquipmentId) return undefined;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation(`/machines/${auvoEquipmentId}/consumption`, params)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [auvoEquipmentId, key]);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
