import { useCallback, useEffect, useState } from "react";
import { fetchPreparationTemplateVersions } from "../lib/preparationsApi";

export function usePreparationTemplateVersions() {
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchPreparationTemplateVersions()
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, items: data?.items ?? [] });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, items: [] });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
