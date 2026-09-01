// Receita Total and Novos Clientes now come from Supabase (useSalesOverview).
// Lucro Operacional, Margem Operacional and Fluxo de Caixa stay mocked here
// until there's a real costs/cash-ledger table to back them.
export const staticKpiCards = [
  {
    id: "profit",
    label: "Lucro Operacional",
    value: "R$ 693K",
    delta: "14,2%",
    direction: "up",
    icon: "trendUp",
    accent: "green",
    sparkline: [38, 40, 39, 43, 45, 47, 50, 49, 53, 57, 60, 64],
    mock: true,
    deltaCaption: "vs Abr 2025",
  },
  {
    id: "margin",
    label: "Margem Operacional",
    value: "28,0%",
    delta: "2,6 p.p.",
    direction: "up",
    icon: "percent",
    accent: "violet",
    sparkline: [45, 46, 44, 47, 48, 50, 49, 52, 54, 53, 56, 58],
    mock: true,
    deltaCaption: "vs Abr 2025",
  },
  {
    id: "cashflow",
    label: "Fluxo de Caixa",
    value: "R$ 812K",
    delta: "22,1%",
    direction: "up",
    icon: "wallet",
    accent: "orange",
    sparkline: [30, 34, 33, 38, 42, 40, 45, 50, 54, 58, 62, 68],
    mock: true,
    deltaCaption: "vs Abr 2025",
  },
];

export const alerts = [
  {
    id: 1,
    severity: "critical",
    icon: "bell",
    title: "Queda na receita",
    description: "Receita caiu 15% em relação aos últimos 7 dias.",
    time: "Há 2h",
  },
  {
    id: 2,
    severity: "warning",
    icon: "user",
    title: "Aumento no CAC",
    description: "CAC aumentou 23% em relação ao mês passado.",
    time: "Há 5h",
  },
  {
    id: 3,
    severity: "serious",
    icon: "box",
    title: "Estoque baixo",
    description: "5 produtos com estoque abaixo do mínimo.",
    time: "Há 1d",
  },
];

export const navItems = [
  { id: "overview", label: "Visão Geral", icon: "home" },
  { id: "clientes", label: "Clientes", icon: "users" },
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
  { id: "logistica", label: "Logística", icon: "truck" },
  { id: "financeiro", label: "Financeiro", icon: "dollar" },
  { id: "newbusiness", label: "New Business", icon: "rocket" },
  { id: "posvenda", label: "Pós Venda", icon: "headset" },
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
  { id: "clientes", label: "Clientes" },
  { id: "ativos", label: "Ativos" },
  { id: "operacao-chamados", label: "Operação · Chamados" },
  { id: "operacao-rotina", label: "Operação · Abastecimento Rotina" },
  { id: "telemetria", label: "Operação · Telemetria" },
  { id: "operacao-completa", label: "Operação · Operação Completa" },
  { id: "logistica", label: "Logística" },
  { id: "financeiro", label: "Financeiro" },
  { id: "newbusiness", label: "New Business" },
  { id: "posvenda", label: "Pós Venda" },
];
