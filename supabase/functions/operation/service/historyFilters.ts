import { ControlledError } from "../shared/http.ts";

export interface HistoryFilters {
  dateFrom: string;
  dateTo: string;
  type?: string;
  technician?: string;
  status?: number;
  search?: string;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

// Sem preset "hoje"/"últimos 7 dias" de propósito — diferente de
// filters.ts (Auvo ao vivo), aqui dateFrom/dateTo são sempre explícitos e
// sem teto de 31 dias, já que a fonte é a tabela curada, não a Auvo direto.
export function parseHistoryFilters(params: URLSearchParams): HistoryFilters {
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (!dateFrom || !dateTo) throw new ControlledError("Informe dateFrom e dateTo (yyyy-mm-dd).", 400);
  if (!isValidDateString(dateFrom) || !isValidDateString(dateTo)) {
    throw new ControlledError("Período inválido — use yyyy-mm-dd.", 400);
  }
  if (dateFrom > dateTo) throw new ControlledError("A data inicial não pode ser depois da data final.", 400);

  const statusRaw = params.get("status");
  const status = statusRaw ? Number(statusRaw) : undefined;

  return {
    dateFrom,
    dateTo,
    type: params.get("type")?.trim() || undefined,
    technician: params.get("technician")?.trim() || undefined,
    status: status !== undefined && Number.isFinite(status) ? status : undefined,
    search: params.get("search")?.trim() || undefined,
  };
}

export function parseHistoryPagination(params: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, Number(params.get("page")) || 1);
  const requested = Number(params.get("pageSize")) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requested), MAX_PAGE_SIZE);
  return { page, pageSize };
}
