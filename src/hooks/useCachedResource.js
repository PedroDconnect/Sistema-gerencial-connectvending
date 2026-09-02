import { useCallback, useEffect, useRef, useState } from "react";

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage indisponível (modo privado, quota cheia) — segue só em memória
  }
}

// Hook genérico "stale-while-revalidate" pra dado de API que vale a pena
// não perder ao recarregar a página (pedido explícito: reiniciar a tela
// não deve zerar tudo e bater na API de novo do zero) — mostra o último
// resultado bom guardado no localStorage na hora, já no primeiro render,
// enquanto busca uma versão fresca em paralelo; erro pontual mantém o
// último dado bom em vez de esvaziar a tela. autoRefreshMs, quando
// passado, repete a busca sozinho nesse intervalo (mesmo espírito do
// polling que useVmpayMachineMonitor já fazia, generalizado aqui).
//
// cacheKey muda quando o "assunto" muda (outro equipamento, outro
// cliente, outro período) — nesse caso troca pro cache daquela chave (ou
// estado de loading, se nunca foi buscada) em vez de continuar mostrando
// o dado da chave anterior até a rede responder.
export function useCachedResource(cacheKey, fetcher, { autoRefreshMs = null, enabled = true } = {}) {
  const [state, setState] = useState(() => {
    const cached = enabled ? readCache(cacheKey) : null;
    return { loading: !cached, error: null, data: cached, key: cacheKey };
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    setState((prev) => {
      if (prev.key === cacheKey) return prev;
      const cached = enabled ? readCache(cacheKey) : null;
      return { loading: !cached, error: null, data: cached, key: cacheKey };
    });
  }, [cacheKey, enabled]);

  const load = useCallback(
    (force) => {
      if (!enabled) return undefined;
      let cancelled = false;

      fetcherRef
        .current(force)
        .then((data) => {
          if (cancelled) return;
          writeCache(cacheKey, data);
          setState({ loading: false, error: null, data, key: cacheKey });
        })
        .catch((error) => {
          if (cancelled) return;
          setState((prev) => ({ ...prev, loading: false, error, key: cacheKey }));
        });

      return () => {
        cancelled = true;
      };
    },
    [cacheKey, enabled]
  );

  useEffect(() => load(), [load]);

  useEffect(() => {
    if (!autoRefreshMs || !enabled) return undefined;
    const interval = setInterval(() => load(), autoRefreshMs);
    return () => clearInterval(interval);
  }, [load, autoRefreshMs, enabled]);

  return { loading: state.loading, error: state.error, data: state.data, refetch: load };
}
