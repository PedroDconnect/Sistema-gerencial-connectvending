// Rótulos/cores em PT-BR só aqui no frontend — mesmo padrão de
// vmpayService.js: o backend nunca decide isso, só devolve o dado já
// normalizado (datas-sentinela já viram null em auvo.assetsNormalizer.ts).

export function formatDateTime(iso) {
  if (!iso) return "Não informado";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso) {
  if (!iso) return "Não informado";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// formatDate() acima espera um instante real (timestamp) e por isso
// converte fuso horário — correto pra creationDate etc. Campos de período
// como byDay[].date, dateFrom/dateTo e startDate/endDate vêm do backend
// como "YYYY-MM-DD" puro (já é o dia certo, sem hora). Passar isso pelo
// formatDate() faz `new Date("2026-08-14")` virar meia-noite UTC, que ao
// converter pra America/Sao_Paulo (UTC-3) recua pro dia anterior — bug
// real: "2026-08-14" aparecia como "13/08/2026". Aqui não há conversão
// de fuso porque não há instante a converter.
export function formatDayOnly(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr ?? "");
  if (!match) return "Não informado";
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

export function formatDayShort(dateStr) {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(dateStr ?? "");
  if (!match) return "";
  const [, m, d] = match;
  return `${d}/${m}`;
}

export function activeMeta(active) {
  return active ? { label: "Ativo", variant: "success" } : { label: "Inativo", variant: "neutral" };
}

export const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
];

export const LINK_STATUS_FILTER_OPTIONS = [
  { value: "with_customer", label: "Com cliente" },
  { value: "without_customer", label: "Sem cliente" },
];

export const EQUIPMENT_STATUS_FILTER_OPTIONS = [
  { value: "with_equipment", label: "Com máquinas" },
  { value: "without_equipment", label: "Sem máquinas" },
];

// Cruzamento Auvo × VMpay por patrimônio (machine_patrimony_registry) —
// nunca corrigido automaticamente, só reportado (ver registryService.ts).
export const MATCH_STATUS_META = {
  MATCH: { label: "Casado", variant: "success" },
  MATCH_NORMALIZED: { label: "Casado (normalizado)", variant: "warning" },
  NOT_FOUND: { label: "Não encontrado na VMpay", variant: "danger" },
  DUPLICATE: { label: "Patrimônio duplicado na VMpay", variant: "danger" },
  NOT_COMPUTED: { label: "Cruzamento ainda não calculado", variant: "neutral" },
};

export function matchStatusMeta(status) {
  return MATCH_STATUS_META[status] ?? MATCH_STATUS_META.NOT_COMPUTED;
}

export function formatSyncTime(isoString) {
  if (!isoString) return "Nunca sincronizado";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Nunca sincronizado";
  const now = new Date();
  const time = date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) return `Hoje, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Ontem, ${time}`;

  return `${date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}, ${time}`;
}
