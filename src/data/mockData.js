// Estrutura de navegação e módulos concedíveis — dados de verdade (não
// mock, apesar do nome do arquivo, mantido só pra não quebrar imports
// existentes). staticKpiCards e alerts (Lucro Operacional/Margem/Fluxo de
// Caixa e o painel de Alertas) foram removidos em 02/09/2026 — eram
// fictícios, sem fonte de dados real, e a pedido explícito só deve existir
// no painel o que está de fato conectado a uma API/fonte real.
export const navItems = [
  { id: "overview", label: "Visão Geral", icon: "home" },
  { id: "ativos", label: "Ativos", icon: "server" },
  {
    id: "operacao",
    label: "Operação",
    icon: "gear",
    children: [
      { id: "operacao-chamados", label: "Chamados", icon: "clipboard" },
      { id: "operacao-rotina", label: "Abastecimento Rotina", icon: "box" },
      { id: "telemetria", label: "Telemetria", icon: "bolt" },
      { id: "operacao-completa", label: "Operação Completa", icon: "layers" },
    ],
  },
  // Só aparece pra admin (ver Sidebar.jsx) — não é um módulo concedível
  // como os outros, é a tela que concede os outros.
  { id: "administracao", label: "Administração", icon: "user" },
];

// Módulos que podem ser liberados por usuário na tela de Administração —
// espelha os ids navegáveis acima (grupos como "operacao" não são
// concedíveis diretamente, só as telas-folha dentro dele). Mantido em
// sincronia manual com ASSIGNABLE_MODULE_IDS em
// supabase/functions/admin/shared/auth.ts (Deno não importa este arquivo).
export const ASSIGNABLE_MODULES = [
  { id: "overview", label: "Visão Geral" },
  { id: "ativos", label: "Ativos" },
  { id: "operacao-chamados", label: "Operação · Chamados" },
  { id: "operacao-rotina", label: "Operação · Abastecimento Rotina" },
  { id: "telemetria", label: "Operação · Telemetria" },
  { id: "operacao-completa", label: "Operação · Operação Completa" },
];
