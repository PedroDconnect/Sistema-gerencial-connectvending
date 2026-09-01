import { useCallback, useEffect, useRef, useState } from "react";

// Pedido explícito: tela cheia, travada numa página, atualizando sozinha a
// cada 10 min — pra um gerente acompanhar num monitor/TV sem precisar
// mexer em nada. 10 min é fixo (não é um dado que muda segundo a segundo),
// bem mais espaçado que o polling de 5 min da Telemetria.
const AUTO_REFRESH_MS = 10 * 60 * 1000;

// Genérico de propósito (não fala nada de Operação/Chamados) pra outras
// telas reaproveitarem só passando o próprio refetch.
export function usePresentationMode(onRefresh) {
  const [active, setActive] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Navegador pode negar tela cheia (ex.: precisa de gesto do usuário,
      // já temos isso vindo de um clique, mas alguns browsers restringem
      // mais) — o modo apresentação (auto-refresh + layout limpo) continua
      // valendo mesmo sem a tela cheia de verdade.
    }
    setActive(true);
  }, []);

  const exit = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // noop
      }
    }
    setActive(false);
  }, []);

  // Cobre quando o usuário sai da tela cheia pelo próprio navegador (Esc,
  // botão do SO) sem passar pelo nosso botão "Sair" — mantém os dois em
  // sincronia.
  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) setActive(false);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const interval = setInterval(() => onRefreshRef.current?.(), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [active]);

  return { active, enter, exit };
}
