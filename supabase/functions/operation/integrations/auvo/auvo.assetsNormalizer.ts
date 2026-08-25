// Allowlist estrita, mesmo espírito de auvo.normalizer.ts (tasks): só os
// campos abaixo saem daqui — o resto do objeto bruto da Auvo (bem maior:
// anexos, contatos completos, especificações) fica só em raw_data, pra
// auditoria/debug, nunca usado em consulta/filtro.

const SENTINEL_DATE_PREFIX = "0001-01-01";

// Confirmado empiricamente (mesma convenção de auvo.auth.ts): a Auvo
// devolve horário de Brasília sem offset. UTC-3 fixo é seguro (Brasil não
// usa mais horário de verão desde 2019). Datas-sentinela ("0001-01-01...",
// equipamento sem garantia/expiração configurada) virram null — nunca uma
// data real.
export function parseAuvoLocalDateTime(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.startsWith(SENTINEL_DATE_PREFIX)) return null;
  const date = new Date(`${raw}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Best-effort: a Auvo não devolve cidade/estado estruturados, só uma
// string de endereço já formatada (confirmado ao vivo, sempre no padrão
// "..., {Cidade} - {UF}, {CEP}"). Sem match, city/state ficam null — nunca
// adivinhados a partir de outro campo (nome, identifier etc., seção 18 do
// pedido original).
const ADDRESS_CITY_STATE_RE = /,\s*([^,]+?)\s*-\s*([A-Z]{2}),\s*\d{5}-?\d{3}\s*$/;

export function parseAddressCityState(address: unknown): { city: string | null; state: string | null } {
  if (typeof address !== "string") return { city: null, state: null };
  const match = ADDRESS_CITY_STATE_RE.exec(address);
  if (!match) return { city: null, state: null };
  return { city: match[1].trim() || null, state: match[2] };
}

// 0/0 é o valor da Auvo pra "sem geolocalização", não uma coordenada real
// (confirmado ao vivo: cliente "HENKEL JUNDIAI" tem lat=0/lon=0) — nunca
// colocado num mapa.
function nullableCoord(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num === 0) return null;
  return num;
}

function str(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

// 0 é o valor da Auvo pra "sem cliente associado" em associatedCustomerId —
// nunca inferido por nome/endereço (seção 18 do pedido original).
function nullableId(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface NormalizedAuvoCustomer {
  auvoId: number;
  description: string | null;
  legalName: string | null;
  cpfCnpj: string | null;
  externalId: string | null;
  address: string | null;
  addressComplement: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  segmentId: number | null;
  creationDate: string | null;
  dateLastUpdate: string | null;
  rawData: Record<string, unknown>;
}

export function normalizeAuvoCustomer(raw: Record<string, unknown>): NormalizedAuvoCustomer {
  const address = str(raw.address);
  const { city, state } = parseAddressCityState(address);

  return {
    auvoId: num(raw.id),
    description: str(raw.description),
    legalName: str(raw.legalName),
    cpfCnpj: str(raw.cpfCnpj),
    externalId: str(raw.externalId),
    address,
    addressComplement: str(raw.adressComplement),
    city,
    state,
    latitude: nullableCoord(raw.latitude),
    longitude: nullableCoord(raw.longitude),
    active: raw.active === true,
    segmentId: nullableId(raw.segmentId),
    creationDate: parseAuvoLocalDateTime(raw.creationDate),
    dateLastUpdate: parseAuvoLocalDateTime(raw.dateLastUpdate),
    rawData: raw,
  };
}

export interface NormalizedAuvoEquipment {
  auvoId: number;
  associatedCustomerId: number | null;
  parentEquipmentId: number | null;
  associatedUserId: number | null;
  categoryId: number | null;
  name: string | null;
  identifier: string | null;
  active: boolean;
  creationDate: string | null;
  expirationDate: string | null;
  warrantyStartDate: string | null;
  warrantyEndDate: string | null;
  description: string | null;
  urlImage: string | null;
  equipmentSpecifications: unknown;
  rawData: Record<string, unknown>;
}

export function normalizeAuvoEquipment(raw: Record<string, unknown>): NormalizedAuvoEquipment {
  return {
    auvoId: num(raw.id),
    associatedCustomerId: nullableId(raw.associatedCustomerId),
    parentEquipmentId: nullableId(raw.parentEquipmentId),
    associatedUserId: nullableId(raw.associatedUserId),
    categoryId: nullableId(raw.categoryId),
    name: str(raw.name),
    identifier: str(raw.identifier),
    active: raw.active === true,
    creationDate: parseAuvoLocalDateTime(raw.creationDate),
    expirationDate: parseAuvoLocalDateTime(raw.expirationDate),
    warrantyStartDate: parseAuvoLocalDateTime(raw.warrantyStartDate),
    warrantyEndDate: parseAuvoLocalDateTime(raw.warrantyEndDate),
    description: str(raw.description),
    urlImage: str(raw.urlImage),
    equipmentSpecifications: Array.isArray(raw.equipmentSpecifications) ? raw.equipmentSpecifications : [],
    rawData: raw,
  };
}
