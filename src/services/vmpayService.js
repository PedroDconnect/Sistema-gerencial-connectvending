// Rótulos/cores em PT-BR só aqui no frontend — o backend nunca decide
// isso, só devolve o status já classificado (ver machineStatus.ts).
export const MACHINE_STATUS_META = {
  operating: { label: "Operando", emoji: "🟢", variant: "success" },
  no_doses: { label: "Sem doses", emoji: "🟡", variant: "warning" },
  no_installation: { label: "Sem instalação", emoji: "⚪", variant: "neutral" },
  data_unavailable: { label: "Dados indisponíveis", emoji: "⚠️", variant: "neutral" },
};

export function machineStatusMeta(status) {
  return MACHINE_STATUS_META[status] ?? MACHINE_STATUS_META.data_unavailable;
}

// "🟢 Operando" etc. — usado como valor de opção no MultiSelect de status
// (que trabalha com strings simples) e pra comparar direto contra o
// status de cada máquina sem precisar de um mapa reverso label->status.
export function statusFilterLabel(status) {
  const meta = machineStatusMeta(status);
  return `${meta.emoji} ${meta.label}`;
}

export const SUMMARY_CARDS = [
  { key: "totalMachines", label: "Total de Máquinas" },
  { key: "machinesWithVends", label: "Com Doses" },
  { key: "withoutVends", label: "Sem Doses", tone: "danger" },
];

// A API devolve tudo em UTC (occurred_at, generatedAt, e last_communication
// já convertido pro backend antes de chegar aqui) — conversão pro fuso
// local só acontece aqui, na hora de mostrar (nunca comparando strings).
export function formatDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

export function formatRssi(rssi) {
  if (rssi === null || rssi === undefined) return "—";
  // 99 é usado pela própria rede como "sem leitura de sinal disponível",
  // não um valor de sinal real — mostrar como tal em vez de "99".
  if (rssi >= 99) return "sem leitura";
  return String(rssi);
}

// Calculado a partir da janela que a própria resposta devolve — nunca
// hardcoded no frontend, pra nunca destoar se o backend mudar o valor.
export function windowHours(window) {
  if (!window?.from || !window?.to) return null;
  const hours = (new Date(window.to) - new Date(window.from)) / 3_600_000;
  return Number.isFinite(hours) ? Math.round(hours) : null;
}

export function formatCarrier(connection) {
  return connection?.carrier || "—";
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

const NUMERIC_KEYS = new Set(["machineId", "vendCountLast2Hours", "quantityLast2Hours"]);

export function sortMachines(list, sortKey, direction = "asc") {
  if (!sortKey) return list;
  const sorted = [...list].sort((a, b) => {
    if (NUMERIC_KEYS.has(sortKey)) return (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
    if (sortKey === "lastVendAt" || sortKey === "lastCommunicationAt") {
      return (a[sortKey] ?? "").localeCompare(b[sortKey] ?? "");
    }
    return collator.compare(a[sortKey] ?? "", b[sortKey] ?? "");
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}

export function matchesSearch(machine, query) {
  if (!query) return true;
  const haystack = `${machine.assetNumber} ${machine.machineId} ${machine.locationName ?? ""} ${machine.place ?? ""}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

// Único lugar que decide "o que fica visível" — usado tanto pela tela
// (pra mostrar a lista filtrada) quanto pela exportação (pra exportar
// exatamente o que está filtrado, não a lista inteira).
export function filterMachines(machines, { search = "", statusFilters = [] } = {}) {
  return machines.filter(
    (m) => (statusFilters.length === 0 || statusFilters.includes(statusFilterLabel(m.status))) && matchesSearch(m, search)
  );
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

const EXPORT_COLUMNS = [
  ["machineId", "ID da Máquina"],
  ["assetNumber", "Asset"],
  ["status", "Status"],
  ["locationName", "Cliente"],
  ["place", "Local"],
  ["lastVendAt", "Última Dose"],
  ["vendCount", "Doses no Período"],
  ["quantity", "Quantidade no Período"],
  ["lastCommunicationAt", "Última Comunicação"],
  ["rssi", "Sinal (RSSI)"],
  ["carrier", "Operadora"],
  ["operationStatus", "Status Operacional (VMpay)"],
  ["machineModelId", "Modelo"],
];

function toExportRow(machine) {
  return {
    machineId: machine.machineId,
    assetNumber: machine.assetNumber,
    status: machineStatusMeta(machine.status).label,
    locationName: machine.locationName ?? "",
    place: machine.place ?? "",
    lastVendAt: formatDateTime(machine.lastVendAt),
    vendCount: machine.vendCountLast2Hours ?? 0,
    quantity: machine.quantityLast2Hours ?? 0,
    lastCommunicationAt: formatDateTime(machine.lastCommunicationAt),
    rssi: formatRssi(machine.connection?.rssi),
    carrier: formatCarrier(machine.connection),
    operationStatus: machine.operationStatus ?? "",
    machineModelId: machine.machineModelId ?? "",
  };
}

export function machinesToCsv(list) {
  const header = EXPORT_COLUMNS.map(([, label]) => csvEscape(label)).join(";");
  const rows = list.map((machine) => {
    const row = toExportRow(machine);
    return EXPORT_COLUMNS.map(([key]) => csvEscape(row[key])).join(";");
  });
  return [header, ...rows].join("\r\n");
}

// Mesmo helper de ativosService.js (BOM + blob + link temporário) —
// duplicado aqui de propósito, não importado de lá: cada serviço de
// módulo é auto-contido, mesma convenção já usada nas Edge Functions
// (ver shared/* de cada function em vez de uma pasta compartilhada única).
export function downloadCsv(filename, csvContent) {
  const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
