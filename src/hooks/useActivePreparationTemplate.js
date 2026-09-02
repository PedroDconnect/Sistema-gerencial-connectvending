import { useCallback, useEffect, useState } from "react";
import { fetchActivePreparationTemplate } from "../lib/preparationsApi";

export function useActivePreparationTemplate() {
  const [state, setState] = useState({ loading: true, error: null, template: null });

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchActivePreparationTemplate()
      .then((template) => {
        if (!cancelled) setState({ loading: false, error: null, template });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, template: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
