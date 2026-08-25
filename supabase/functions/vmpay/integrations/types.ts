// Modelo interno — allowlist estrita do que a VMpay devolve. Nenhum campo
// financeiro/de auditoria (services, states completos, audit_schedule
// etc.) passa disso pra frente; só o que o monitoramento realmente usa.

export interface Machine {
  id: number;
  assetNumber: string;
  externalId: string | null;
  distributionCenterId: number | null;
  machineModelId: number | null;
  tags: string[];
}

export interface Installation {
  id: number;
  machineId: number;
  locationId: number | null;
  place: string;
  // string "dd/MM/yyyy HH:mm" da própria VMpay — confirmado empiricamente
  // que corresponde a UTC (bate com o relógio do servidor), mas sem "Z".
  // Nunca comparar como string — sempre converter (ver vmpay.normalizer.ts).
  lastCommunicationRaw: string | null;
  lastCommunicationAt: string | null; // ISO UTC já convertido
  operationStatus: string | null; // "green" | "red" | "yellow" | "grey" | "blue" (valores reais confirmados)
  states: string[]; // ex.: "no_communication", "reader_disabled" — sinais diretos da própria API
  connection: {
    kind: string | null;
    rssi: number | null;
    carrier: string | null;
  } | null;
}

export interface Location {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
}

export interface VendWindowEntry {
  lastVendAt: string;
  vendCount: number;
  totalQuantity: number;
}

export type MachineMonitorStatus =
  | "operating"
  | "no_doses"
  | "no_installation"
  | "data_unavailable";

export interface MonitoredMachine {
  machineId: number;
  assetNumber: string;
  machineModelId: number | null;
  tags: string[];
  installationId: number | null;
  locationId: number | null;
  locationName: string | null;
  place: string | null;
  operationStatus: string | null;
  states: string[];
  lastCommunicationAt: string | null;
  connection: Installation["connection"];
  lastVendAt: string | null;
  vendCountLast2Hours: number;
  quantityLast2Hours: number;
  status: MachineMonitorStatus;
}
