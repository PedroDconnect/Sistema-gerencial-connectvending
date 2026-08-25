import { useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

// Buscado uma vez só (sem parâmetros) — as opções de Modelo/Cliente/Estado
// não mudam com os filtros já selecionados, então não precisa recarregar a
// cada mudança de filtro.
export function useOperacaoCompletaFilterOptions() {
  const [state, setState] = useState({ loading: true, error: null, models: [], customers: [], states: [] });

  useEffect(() => {
    let cancelled = false;

    fetchOperation("/assets/filter-options")
      .then((data) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            models: data?.models ?? [],
            customers: data?.customers ?? [],
            states: data?.states ?? [],
          });
        }
      })
      .catch((error) => {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
