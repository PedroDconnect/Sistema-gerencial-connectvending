import { todayBrazil, addDays } from "./filters.ts";
import { ControlledError } from "../shared/http.ts";

// Período customizado de consumo pode ser bem maior que o de auditoria de
// tarefas (que bate direto na Auvo) — aqui é só um SUM sobre
// machine_consumption_daily, já agregado e indexado por patrimônio+data,
// então um teto bem mais folgado (1 ano) é seguro sem penalizar
// performance.
const MAX_RANGE_DAYS = 366;

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function parseConsumptionDateRange(params: URLSearchParams): { startDate: string; endDate: string } {
  const today = todayBrazil();
  const period = params.get("period");

  if (period === "yesterday") {
    const yesterday = addDays(today, -1);
    return { startDate: yesterday, endDate: yesterday };
  }
  if (period === "7d") return { startDate: addDays(today, -6), endDate: today };
  if (period === "30d") return { startDate: addDays(today, -29), endDate: today };
  if (period === "90d") return { startDate: addDays(today, -89), endDate: today };

  const startDate = params.get("start_date") || today;
  const endDate = params.get("end_date") || today;

  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    throw new ControlledError("Período inválido.", 400);
  }
  if (startDate > endDate) {
    throw new ControlledError("A data inicial não pode ser depois da data final.", 400);
  }

  const rangeDays = (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new ControlledError(`Período muito amplo (máximo de ${MAX_RANGE_DAYS} dias).`, 422);
  }

  return { startDate, endDate };
}

// Painel gerencial por cliente: default pedido explicitamente como "os
// últimos 7 dias, de forma rápida" (19/08 pedia 3 meses; 20/08 trocou
// pra isso — 7 dias é bem mais rápido tanto pro agregado do Postgres
// quanto pro lado que bate na Auvo ao vivo, que é o caro aqui). Continua
// aceitando period=30d/90d/custom pra quem quiser ampliar.
export function parseCustomerPanelDateRange(params: URLSearchParams): { startDate: string; endDate: string } {
  if (!params.get("period") && !params.get("start_date") && !params.get("end_date")) {
    const today = todayBrazil();
    return { startDate: addDays(today, -6), endDate: today };
  }
  return parseConsumptionDateRange(params);
}
