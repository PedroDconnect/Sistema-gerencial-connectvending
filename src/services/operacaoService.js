// Espelha o enum interno do backend (supabase/functions/operation/service/status.ts).
// Os valores numéricos coincidem com os da Auvo hoje, mas o rótulo em
// português é definido só aqui no frontend — nenhum componente compara
// "status === 1" diretamente.
export const TASK_STATUS = {
  OPENED: 1,
  IN_DISPLACEMENT: 2,
  CHECKED_IN: 3,
  CHECKED_OUT: 4,
  FINISHED: 5,
  PAUSED: 6,
};

export const TASK_STATUS_OPTIONS = [
  { value: TASK_STATUS.OPENED, label: "Aberta" },
  { value: TASK_STATUS.IN_DISPLACEMENT, label: "Em deslocamento" },
  { value: TASK_STATUS.CHECKED_IN, label: "Em atendimento" },
  { value: TASK_STATUS.CHECKED_OUT, label: "Check-out realizado" },
  { value: TASK_STATUS.FINISHED, label: "Finalizada" },
  { value: TASK_STATUS.PAUSED, label: "Pausada" },
];

const STATUS_LABEL_BY_VALUE = Object.fromEntries(TASK_STATUS_OPTIONS.map((o) => [o.value, o.label]));

export function taskStatusLabel(status) {
  return STATUS_LABEL_BY_VALUE[status] ?? "Desconhecido";
}

// Regra pedida: só "Finalizada" é verde — todo o resto (aberta, em
// deslocamento, em atendimento, checkout realizado, pausada) é "ainda não
// terminou" e fica vermelho, sem distinção de estágio intermediário.
export function taskStatusBadgeVariant(status) {
  return status === TASK_STATUS.FINISHED ? "success" : "danger";
}

export const PERIOD_PRESETS = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "last7days", label: "Últimos 7 dias" },
  { id: "custom", label: "Período personalizado" },
];

export function formatPercent(value) {
  return `${Number(value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// Percentual de "value" dentro de "total", 1 casa decimal, 0 quando não há total.
export function sharePercent(value, total) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

// Categorias de "chamados por cliente" que sinalizam problema operacional
// (equipamento com defeito, abastecimento fora da rota programada) — os
// números dessas colunas aparecem em vermelho quando > 0.
export const NEGATIVE_CUSTOMER_TYPE_KEYS = ["abastecimento", "corretivo"];

// SLA = 4h, da abertura (creationDate) ao checkout (checkOutDate) — espelha
// supabase/functions/operation/service/operationService.ts.
export const SLA_HOURS = 4;

export function computeTaskDurationHours(task) {
  if (!task?.creationDate || !task?.checkOutDate) return null;
  const start = new Date(task.creationDate).getTime();
  const end = new Date(task.checkOutDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 3_600_000;
}

// Alguns chamados são criados no sistema dias/semanas antes da data
// agendada — quando isso acontece, a duração criação→checkout passa de
// dias, não só de horas. Formata os dois casos com clareza em vez de
// mostrar "1824h" sem contexto.
export function formatDurationHours(hours) {
  if (hours == null) return "—";
  const totalMinutes = Math.round(hours * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const remainderMinutes = totalMinutes % (60 * 24);
  const h = Math.floor(remainderMinutes / 60);
  const m = remainderMinutes % 60;

  if (days > 0) return h > 0 ? `${days}d ${h}h` : `${days}d`;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// SLA se aplica só a chamado corretivo e chamado de abastecimento —
// pedido explicitamente. Espelha isSlaEligible/taskSlaStatus no backend
// (supabase/functions/operation/service/operationService.ts).
const SLA_ELIGIBLE_TYPE_NAMES = ["Abastecimento - Chamado", "Chamado Técnico corretivo"];

export function isSlaEligibleTask(task) {
  return SLA_ELIGIBLE_TYPE_NAMES.includes(task?.taskTypeName);
}

// "pending" = elegível mas ainda sem checkout. "not_applicable" = tipo de
// chamado fora do escopo do SLA (VmPay/UpPay, Abastecimento Rotina etc.).
export function taskSlaStatus(task) {
  if (!isSlaEligibleTask(task)) return "not_applicable";
  const duration = computeTaskDurationHours(task);
  if (duration == null) return "pending";
  return duration <= SLA_HOURS ? "within" : "outside";
}

export const SLA_FILTER_OPTIONS = [
  { value: "within", label: "Atendidos dentro do SLA" },
  { value: "outside", label: "Atendidos fora do SLA" },
];
