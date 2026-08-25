import { Task } from "../types.ts";

// Allowlist estrita — o objeto real da Auvo é muito maior que isto
// (questionários com respostas e fotos, produtos/serviços/custos
// adicionais, categoria financeira, assinatura do cliente com documento).
// Nada disso é copiado: só os campos abaixo, um a um, saem daqui.
// taskUrl é preservado exatamente como veio, nunca reconstruído.
export function normalizeAuvoTask(raw: Record<string, unknown>): Task {
  // Confirmado nos dados reais: a Auvo às vezes devolve nomes de tipo com
  // espaço sobrando ("Leitura ", "Entrega -  Chamado ") — sem trim, "X" e
  // "X " virariam grupos diferentes ao agrupar/comparar.
  const str = (v: unknown): string =>
    (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
  const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
  const nullableNum = (v: unknown): number | null => (typeof v === "number" ? v : v == null ? null : Number(v) || null);
  const nullableStr = (v: unknown): string | null => {
    const trimmed = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  const bool = (v: unknown): boolean => v === true;

  return {
    id: num(raw.taskID),
    externalId: str(raw.externalId),
    taskTypeId: num(raw.taskType),
    taskTypeName: str(raw.taskTypeDescription),
    technicianId: num(raw.idUserTo),
    technicianName: str(raw.userToName),
    customerId: num(raw.customerId),
    customerName: str(raw.customerDescription),
    creationDate: nullableStr(raw.creationDate),
    taskDate: nullableStr(raw.taskDate),
    address: str(raw.address),
    latitude: nullableNum(raw.latitude),
    longitude: nullableNum(raw.longitude),
    priority: nullableNum(raw.priority),
    status: num(raw.taskStatus),
    finished: bool(raw.finished),
    checkIn: bool(raw.checkIn),
    checkInDate: nullableStr(raw.checkInDate),
    checkOut: bool(raw.checkOut),
    checkOutDate: nullableStr(raw.checkOutDate),
    reasonForPause: str(raw.reasonForPause),
    taskUrl: nullableStr(raw.taskUrl),
  };
}
