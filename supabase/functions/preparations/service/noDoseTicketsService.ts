import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";
import { CallerInfo } from "../shared/auth.ts";
import { logEvent } from "../shared/logger.ts";
import { readAuvoCredentials } from "../integrations/auvo/auvo.config.ts";
import { createTicket } from "../integrations/auvo/auvoTickets.ts";

// "Rodar análise" na tela de Telemetria (08/09/2026): abre 1 chamado Auvo
// por máquina "sem doses", em massa ou por seleção manual. Duplicado de
// vmpay/service/patrimonyUtils.ts — cada function é auto-contida, esta é a
// única outra function que precisa cruzar patrimônio VMpay × Auvo.
function normalizePatrimony(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (/^\d+$/.test(upper)) {
    const stripped = upper.replace(/^0+/, "");
    return stripped || "0";
  }
  return upper;
}

export interface NoDoseMachineInput {
  assetNumber: string | null;
  machineId: number | null;
  locationName?: string | null;
  place?: string | null;
  lastCommunicationAt?: string | null;
  lastVendAt?: string | null;
}

export interface NoDoseTicketResult {
  assetNumber: string | null;
  machineId: number | null;
  ok: boolean;
  ticketId?: number;
  matchedCustomer: boolean;
  error?: string;
}

// Mesmo teto de concorrência do fetch de /vends em vmpay (VMPAY_VENDS_FETCH_CONCURRENCY):
// os ~120 "sem doses" de hoje nunca disparam tudo de uma vez contra a Auvo
// (rate limit real, já visto em auvoWriteClient.ts).
const CONCURRENCY = 5;

// Só usa o cruzamento quando ele é INEQUÍVOCO (MATCH/MATCH_NORMALIZED) — um
// relacionamento errado é pior que abrir o chamado sem cliente (mesmo
// princípio do próprio registry, ver registryService.ts).
async function resolveCustomerIdsByAsset(db: SupabaseClient, assetNumbers: string[]): Promise<Map<string, number>> {
  const normalizedByAsset = new Map<string, string>();
  for (const asset of assetNumbers) {
    const normalized = normalizePatrimony(asset);
    if (normalized) normalizedByAsset.set(asset, normalized);
  }
  const normalizedList = [...new Set(normalizedByAsset.values())];
  if (normalizedList.length === 0) return new Map();

  const { data: registryRows, error: registryError } = await db
    .from("machine_patrimony_registry")
    .select("normalized_patrimony, auvo_equipment_id")
    .in("normalized_patrimony", normalizedList)
    .in("match_status", ["MATCH", "MATCH_NORMALIZED"]);
  if (registryError) throw new ControlledError(`Falha ao consultar cruzamento de patrimônio: ${registryError.message}`, 502);

  const equipmentIdByNormalized = new Map<string, number>();
  for (const row of (registryRows ?? []) as { normalized_patrimony: string; auvo_equipment_id: number | null }[]) {
    if (row.auvo_equipment_id != null) equipmentIdByNormalized.set(row.normalized_patrimony, row.auvo_equipment_id);
  }
  const equipmentIds = [...new Set(equipmentIdByNormalized.values())];
  if (equipmentIds.length === 0) return new Map();

  // associated_customer_id já É o auvo_id do cliente (mesma coluna usada em
  // auvo_assets_view/auvo_customers_view via "c.auvo_id = e.associated_customer_id")
  // — dá pra usar direto como customerId da Auvo, sem outra consulta.
  const { data: equipmentRows, error: equipmentError } = await db
    .from("auvo_equipments")
    .select("auvo_id, associated_customer_id")
    .in("auvo_id", equipmentIds);
  if (equipmentError) throw new ControlledError(`Falha ao consultar equipamentos Auvo: ${equipmentError.message}`, 502);

  const customerIdByEquipmentId = new Map<number, number>();
  for (const row of (equipmentRows ?? []) as { auvo_id: number; associated_customer_id: number | null }[]) {
    if (row.associated_customer_id != null) customerIdByEquipmentId.set(row.auvo_id, row.associated_customer_id);
  }

  const result = new Map<string, number>();
  for (const [asset, normalized] of normalizedByAsset) {
    const equipmentId = equipmentIdByNormalized.get(normalized);
    const customerId = equipmentId != null ? customerIdByEquipmentId.get(equipmentId) : undefined;
    if (customerId != null) result.set(asset, customerId);
  }
  return result;
}

function buildTicketInput(
  machine: NoDoseMachineInput,
  customerId: number | undefined,
  requestTypeId: number,
  caller: CallerInfo
) {
  const assetLabel = machine.assetNumber ?? (machine.machineId != null ? `#${machine.machineId}` : "desconhecido");
  const lines = [
    "Máquina sem doses nas últimas 24 horas — análise disparada manualmente em Telemetria.",
    `Asset: ${machine.assetNumber ?? "—"}`,
    `ID da máquina (VMpay): ${machine.machineId ?? "—"}`,
    `Cliente/local (VMpay): ${machine.locationName ?? "—"}`,
    `Local: ${machine.place ?? "—"}`,
    `Última comunicação: ${machine.lastCommunicationAt ?? "sem registro"}`,
    `Última dose: ${machine.lastVendAt ?? "sem registro"}`,
    ...(customerId === undefined ? ["Cliente Auvo não identificado automaticamente pelo cruzamento de patrimônio."] : []),
  ];
  return {
    title: `Máquina sem doses — Asset ${assetLabel}`,
    description: lines.join("\n"),
    customerId,
    requestTypeId,
    requesterName: caller.name ?? caller.email ?? "",
    requesterEmail: caller.email ?? "",
    externalId: `NODOSE-${assetLabel}-${new Date().toISOString().slice(0, 10)}`,
  };
}

export async function createNoDoseTickets(
  db: SupabaseClient,
  caller: CallerInfo,
  requestTypeId: number,
  machines: NoDoseMachineInput[]
): Promise<NoDoseTicketResult[]> {
  if (!requestTypeId) throw new ControlledError("Tipo de solicitação é obrigatório.", 400);
  if (!Array.isArray(machines) || machines.length === 0) throw new ControlledError("Selecione ao menos 1 máquina.", 400);
  if (machines.length > 500) throw new ControlledError("Selecione no máximo 500 máquinas por análise.", 400);

  const creds = readAuvoCredentials();
  const assetNumbers = machines.map((m) => m.assetNumber).filter((a): a is string => Boolean(a));
  const customerIdByAsset = await resolveCustomerIdsByAsset(db, assetNumbers);

  const results: NoDoseTicketResult[] = new Array(machines.length);
  let cursor = 0;

  async function worker() {
    while (cursor < machines.length) {
      const index = cursor++;
      const machine = machines[index];
      const customerId = machine.assetNumber ? customerIdByAsset.get(machine.assetNumber) : undefined;
      try {
        const created = await createTicket(db, creds, buildTicketInput(machine, customerId, requestTypeId, caller));
        results[index] = {
          assetNumber: machine.assetNumber,
          machineId: machine.machineId,
          ok: true,
          ticketId: created.ticketId,
          matchedCustomer: customerId !== undefined,
        };
      } catch (error) {
        results[index] = {
          assetNumber: machine.assetNumber,
          machineId: machine.machineId,
          ok: false,
          matchedCustomer: customerId !== undefined,
          error: error instanceof Error ? error.message : "Falha desconhecida ao criar o chamado.",
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, machines.length) }, worker));

  const ok = results.filter((r) => r.ok).length;
  await logEvent(db, "auvo", "AUVO_NO_DOSE_TICKETS_BULK_RESULT", {
    userId: caller.id,
    requestTypeId,
    total: machines.length,
    ok,
    failed: machines.length - ok,
    matchedCustomers: results.filter((r) => r.matchedCustomer).length,
  });

  return results;
}
