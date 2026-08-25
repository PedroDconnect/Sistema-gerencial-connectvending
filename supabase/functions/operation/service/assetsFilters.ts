export const ASSETS_DEFAULT_PAGE_SIZE = 50;
export const ASSETS_MAX_PAGE_SIZE = 200; // teto nosso — a tabela local não tem o limite de 100 da própria Auvo

function parseOptionalInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseAssetsPagination(params: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, parseOptionalInt(params.get("page")) ?? 1);
  const requestedSize = parseOptionalInt(params.get("pageSize")) ?? ASSETS_DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requestedSize), ASSETS_MAX_PAGE_SIZE);
  return { page, pageSize };
}

function parseActive(value: string | null): boolean | undefined {
  if (value === "active") return true;
  if (value === "inactive") return false;
  return undefined;
}

function parseLinkStatus(value: string | null): "with_customer" | "without_customer" | undefined {
  return value === "with_customer" || value === "without_customer" ? value : undefined;
}

function parseEquipmentStatus(value: string | null): "with_equipment" | "without_equipment" | undefined {
  return value === "with_equipment" || value === "without_equipment" ? value : undefined;
}

// MultiSelects do frontend mandam a seleção como lista separada por vírgula
// (fetchOperation faz String(array) => "a,b,c" sozinho, sem precisar de
// nenhum parâmetro repetido na URL) — só split+trim aqui do lado do servidor.
function parseCsvList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export interface AssetsListFilters {
  search?: string;
  active?: boolean;
  customerId?: number;
  models?: string[];
  customers?: string[];
  states?: string[];
  linkStatus?: "with_customer" | "without_customer";
}

export function parseAssetsListFilters(params: URLSearchParams): AssetsListFilters {
  return {
    search: params.get("search")?.trim() || undefined,
    active: parseActive(params.get("status")),
    customerId: parseOptionalInt(params.get("customerId")),
    models: parseCsvList(params.get("models")),
    customers: parseCsvList(params.get("customers")),
    states: parseCsvList(params.get("states")),
    linkStatus: parseLinkStatus(params.get("linkStatus")),
  };
}

export interface CustomersListFilters {
  search?: string;
  active?: boolean;
  equipmentStatus?: "with_equipment" | "without_equipment";
}

export function parseCustomersListFilters(params: URLSearchParams): CustomersListFilters {
  return {
    search: params.get("search")?.trim() || undefined,
    active: parseActive(params.get("status")),
    equipmentStatus: parseEquipmentStatus(params.get("equipmentStatus")),
  };
}

export interface MapFilters {
  active?: boolean;
  customerId?: number;
  models?: string[];
  customers?: string[];
  states?: string[];
}

export function parseMapFilters(params: URLSearchParams): MapFilters {
  return {
    active: parseActive(params.get("status")),
    customerId: parseOptionalInt(params.get("customerId")),
    models: parseCsvList(params.get("models")),
    customers: parseCsvList(params.get("customers")),
    states: parseCsvList(params.get("states")),
  };
}
