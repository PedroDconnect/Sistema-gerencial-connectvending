import { useCallback, useEffect, useState } from "react";
import { fetchVmpay } from "../lib/vmpayApi";

// Alinhado ao VMPAY_CACHE_TTL_SECONDS padrão do backend (300s) — não tem
// como ler o valor configurado de dentro do frontend, então usa o mesmo
// default sugerido no pedido. Repetir antes disso só bate no cache mesmo.
const AUTO_REFRESH_MS = 5 * 60 * 1000;

export function useVmpayMachineMonitor() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback((force = false) => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchVmpay("/machine-monitor", force ? { refresh: 1 } : {})
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        // Mantém o último snapshot bom em vez de zerar a tela por uma
        // falha pontual de atualização.
        if (!cancelled) setState((prev) => ({ loading: false, error, data: prev.data }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(false), [load]);

  useEffect(() => {
    const interval = setInterval(() => load(false), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  return { ...state, refetch: load };
}
