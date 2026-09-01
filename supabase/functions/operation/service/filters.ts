import { TaskFilters } from "../integrations/types.ts";
import { ControlledError } from "../shared/http.ts";
import { DAILY_TYPE_CATEGORY_KEYS } from "./taskTypeCategories.ts";

const BRAZIL_TZ = "America/Sao_Paulo";
export const MAX_DATE_RANGE_DAYS = 31;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50; // teto nosso, dentro do teto de 100 da própria Auvo

// "Hoje" precisa ser o hoje do Brasil, não o UTC do servidor da Edge
// Function — perto da meia-noite os dois divergem.
function brazilDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayBrazil(): string {
  return brazilDateString(new Date());
}

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function resolveDateRange(params: URLSearchParams): { dateFrom: string; dateTo: string } {
  const today = todayBrazil();
  const preset = params.get("period");

  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return { dateFrom: yesterday, dateTo: yesterday };
  }
  if (preset === "last7days") {
    return { dateFrom: addDays(today, -6), dateTo: today };
  }

  const dateFrom = params.get("dateFrom") || today;
  const dateTo = params.get("dateTo") || today;

  if (!isValidDateString(dateFrom) || !isValidDateString(dateTo)) {
    throw new ControlledError("Período inválido.", 400);
  }
  if (dateFrom > dateTo) {
    throw new ControlledError("A data inicial não pode ser depois da data final.", 400);
  }

  const rangeDays = (new Date(`${dateTo}T00:00:00Z`).getTime() - new Date(`${dateFrom}T00:00:00Z`).getTime()) / 86_400_000;
  if (rangeDays > MAX_DATE_RANGE_DAYS) {
    throw new ControlledError("Período amplo. Refine os filtros para realizar uma auditoria.", 422);
  }

  return { dateFrom, dateTo };
}

function parseOptionalInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseSla(value: string | null): "within" | "outside" | undefined {
  return value === "within" || value === "outside" ? value : undefined;
}

function parseTypeCategory(value: string | null): string | undefined {
  return value && DAILY_TYPE_CATEGORY_KEYS.has(value) ? value : undefined;
}

function parseScope(value: string | null): "chamados" | "rotina" | undefined {
  return value === "chamados" || value === "rotina" ? value : undefined;
}

export function parseTaskFilters(params: URLSearchParams): TaskFilters {
  const { dateFrom, dateTo } = resolveDateRange(params);
  return {
    dateFrom,
    dateTo,
    status: parseOptionalInt(params.get("status")),
    technicianId: parseOptionalInt(params.get("technician")),
    customerId: parseOptionalInt(params.get("customer")),
    taskTypeId: parseOptionalInt(params.get("type")),
    sla: parseSla(params.get("sla")),
    typeCategory: parseTypeCategory(params.get("typeCategory")),
    scope: parseScope(params.get("scope")),
  };
}

export function parsePagination(params: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, parseOptionalInt(params.get("page")) ?? 1);
  const requestedSize = parseOptionalInt(params.get("pageSize")) ?? DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requestedSize), MAX_PAGE_SIZE);
  return { page, pageSize };
}
