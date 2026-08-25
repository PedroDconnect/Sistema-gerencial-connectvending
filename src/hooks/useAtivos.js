import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { normalizeAtivos } from "../services/ativosService";

// Cache em memória do módulo: sobrevive a montar/desmontar a página (troca de
// aba) e ao double-invoke de efeitos do StrictMode, para não bater na API do
// Protheus (que já faz várias requisições internamente) mais do que o necessário.
// Só é invalidado por um refetch explícito ("Atualizar dados").
let cachedPayload = null;
let inFlightRequest = null;

async function requestAtivos({ force = false } = {}) {
  if (!force && cachedPayload) return cachedPayload;
  if (inFlightRequest) return inFlightRequest;

  inFlightRequest = (async () => {
    const { data, error } = await supabase.functions.invoke("ativos");
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    const payload = {
      ativos: Array.isArray(data?.ativos) ? data.ativos : [],
      fetchedAt: data?.fetchedAt ?? new Date().toISOString(),
    };
    cachedPayload = payload;
    return payload;
  })();

  try {
    return await inFlightRequest;
  } finally {
    inFlightRequest = null;
  }
}

export function useAtivos() {
  const [state, setState] = useState(() => ({
    loading: !cachedPayload,
    refreshing: false,
    error: null,
    data: cachedPayload ? normalizeAtivos(cachedPayload.ativos) : [],
    fetchedAt: cachedPayload?.fetchedAt ?? null,
  }));

  const load = useCallback(({ force = false } = {}) => {
    let cancelled = false;

    setState((prev) => ({
      ...prev,
      loading: !force && prev.data.length === 0,
      refreshing: force,
      error: null,
    }));

    requestAtivos({ force })
      .then((payload) => {
        if (cancelled) return;
        setState({
          loading: false,
          refreshing: false,
          error: null,
          data: normalizeAtivos(payload.ativos),
          fetchedAt: payload.fetchedAt,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false, refreshing: false, error: err }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cachedPayload) return undefined;
    return load();
  }, [load]);

  return { ...state, refetch: () => load({ force: true }) };
}
