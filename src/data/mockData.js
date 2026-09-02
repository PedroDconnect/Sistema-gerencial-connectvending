// Estrutura de navegação e módulos concedíveis — dados de verdade (não
// mock, apesar do nome do arquivo, mantido só pra não quebrar imports
// existentes). staticKpiCards e alerts (Lucro Operacional/Margem/Fluxo de
// Caixa e o painel de Alertas) foram removidos em 02/09/2026 — eram
// fictícios, sem fonte de dados real, e a pedido explícito só deve existir
// no painel o que está de fato conectado a uma API/fonte real.
export const navItems = [
  { id: "overview", label: "Visão Geral", icon: "home" },
  { id: "ativos", label: "Ativos", icon: "server" },
  { id: "preparacoes", label: "Pedidos de Preparação", icon: "clipboard" },
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
  // Só aparece pra admin (ver Sidebar.jsx) — não são módulos concedíveis
  // como os outros, são telas que concedem/configuram os outros. Virou
  // grupo em 02/09/2026 (antes só tinha "Usuários") pra caber a
  // configuração da Ficha de Preparação.
  {
    id: "administracao",
    label: "Administração",
    icon: "user",
    children: [
      { id: "administracao-usuarios", label: "Usuários", icon: "user" },
      { id: "administracao-ficha-preparacao", label: "Ficha de Preparação", icon: "clipboard" },
    ],
  },
];

// Módulos que podem ser liberados por usuário na tela de Administração —
// espelha os ids navegáveis acima (grupos como "operacao"/"administracao"
// não são concedíveis diretamente, só as telas-folha dentro dele, e as
// telas de admin nunca entram aqui — são gated só por isAdmin). Mantido em
// sincronia manual com ASSIGNABLE_MODULE_IDS em
// supabase/functions/admin/shared/auth.ts (Deno não importa este arquivo).
export const ASSIGNABLE_MODULES = [
  { id: "overview", label: "Visão Geral" },
  { id: "ativos", label: "Ativos" },
  { id: "preparacoes", label: "Pedidos de Preparação" },
  { id: "operacao-chamados", label: "Operação · Chamados" },
  { id: "operacao-rotina", label: "Operação · Abastecimento Rotina" },
  { id: "telemetria", label: "Operação · Telemetria" },
  { id: "operacao-completa", label: "Operação · Operação Completa" },
];
