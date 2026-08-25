import { useCallback, useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

// Separado de useOperacaoSummary de propósito: /details busca as tarefas
// reais do período (a única forma confiável de contar por status na
// Auvo) e por isso é bem mais lento — a tela mostra o total rápido
// primeiro e preenche o resto quando isto chegar.
export function useOperacaoDetails(params) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperation("/details", params)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
