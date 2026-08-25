import { Installation, Location, Machine } from "./types.ts";

export function normalizeMachine(raw: Record<string, unknown>): Machine {
  return {
    id: Number(raw.id),
    assetNumber: typeof raw.asset_number === "string" ? raw.asset_number.trim() : String(raw.asset_number ?? ""),
    externalId: typeof raw.external_id === "string" ? raw.external_id : null,
    distributionCenterId: typeof raw.distribution_center_id === "number" ? raw.distribution_center_id : null,
    machineModelId: typeof raw.machine_model_id === "number" ? raw.machine_model_id : null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
  };
}

// "13/08/2026 17:33" — confirmado empiricamente que corresponde a UTC
// (bate com o relógio do servidor no momento do teste), sem sufixo "Z".
// Nunca comparar como string (pedido explícito) — sempre converter aqui,
// uma vez, pro formato ISO UTC real.
export function parseLastCommunication(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:00.000Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : iso;
}

export function normalizeInstallation(raw: Record<string, unknown>): Installation {
  const connectionRaw = raw.connection as Record<string, unknown> | undefined;
  return {
    id: Number(raw.id),
    machineId: Number(raw.machine_id),
    locationId: typeof raw.location_id === "number" ? raw.location_id : null,
    place: typeof raw.place === "string" ? raw.place.trim() : "",
    lastCommunicationRaw: typeof raw.last_communication === "string" ? raw.last_communication : null,
    lastCommunicationAt: parseLastCommunication(raw.last_communication as string | null | undefined),
    operationStatus: typeof raw.operation_status === "string" ? raw.operation_status : null,
    states: Array.isArray(raw.states) ? raw.states.filter((s): s is string => typeof s === "string") : [],
    connection: connectionRaw
      ? {
          kind: typeof connectionRaw.kind === "string" ? connectionRaw.kind : null,
          rssi: typeof connectionRaw.rssi === "number" ? connectionRaw.rssi : null,
          carrier: typeof connectionRaw.carrier === "string" ? connectionRaw.carrier : null,
        }
      : null,
  };
}

export function normalizeLocation(raw: Record<string, unknown>): Location {
  return {
    id: Number(raw.id),
    name: typeof raw.name === "string" ? raw.name.trim() : "",
    city: typeof raw.city === "string" ? raw.city : null,
    state: typeof raw.state === "string" ? raw.state : null,
  };
}

export interface RawVend {
  machineId: number;
  occurredAt: string;
  quantity: number;
}

// Só o mínimo pro índice (seção 7 do pedido) — nunca guardamos a venda
// inteira (cliente, produto, valor etc.) pra esse monitoramento.
export function normalizeVend(raw: Record<string, unknown>): RawVend {
  return {
    machineId: Number(raw.machine_id),
    occurredAt: String(raw.occurred_at),
    quantity: typeof raw.quantity === "number" ? raw.quantity : 0,
  };
}
