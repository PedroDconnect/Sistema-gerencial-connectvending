import { useCallback, useState } from "react";

const STORAGE_KEY = "painel-gerencial-sidebar-collapsed";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Mesmo espírito de useTheme: preferência de UI que persiste entre sessões
// no localStorage, com fallback silencioso quando ele não está disponível
// (modo privado, etc.) — aí a escolha só dura a sessão.
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readStored);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // localStorage indisponível — segue só em memória
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
