import { useEffect, useState } from "react";
import { fetchOperation } from "../lib/operationApi";

export function useOperacaoTask(taskId) {
  const [state, setState] = useState({ loading: false, error: null, task: null });

  useEffect(() => {
    if (!taskId) {
      setState({ loading: false, error: null, task: null });
      return undefined;
    }

    let cancelled = false;
    setState({ loading: true, error: null, task: null });

    fetchOperation(`/tasks/${taskId}`)
      .then((task) => {
        if (!cancelled) setState({ loading: false, error: null, task });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, task: null });
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return state;
}
