import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";

export interface SyncStatusMeta {
  syncedAt: string | null;
  status: string | null;
  error: string | null;
}

export async function readSyncStatus(db: SupabaseClient, cacheKey: string, statusField: string, errorField: string): Promise<SyncStatusMeta> {
  const { data } = await db
    .from("operational_snapshot_cache")
    .select("generated_at, payload")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  const payload = (data?.payload ?? {}) as Record<string, unknown>;
  return {
    syncedAt: (data?.generated_at as string) ?? null,
    status: (payload[statusField] as string) ?? null,
    error: (payload[errorField] as string) ?? null,
  };
}

interface RegistryRow {
  auvo_equipment_id: number;
  auvo_identifier: string | null;
  normalized_patrimony: string;
  vmpay_machine_id: number | null;
  vmpay_asset_number: string | null;
  vmpay_machine_model_id: number | null;
  match_status: "MATCH" | "MATCH_NORMALIZED" | "NOT_FOUND" | "DUPLICATE";
  candidate_count: number;
  computed_at: string;
}

export interface ConsumptionResult {
  matchStatus: "MATCH" | "MATCH_NORMALIZED" | "NOT_FOUND" | "DUPLICATE" | "NOT_COMPUTED";
  vmpayMachineId: number | null;
  vmpayAssetNumber: string | null;
  vmpayMachineModelId: number | null;
  candidateCount: number;
  startDate: string;
  endDate: string;
  totalQuantity: number;
  totalSales: number;
  byDay: Array<{ date: string; quantity: number; salesCount: number }>;
  byProduct: Array<{ productName: string; quantity: number; salesCount: number }>;
  registrySyncedAt: string | null;
  registrySyncStatus: string | null;
  salesSyncedAt: string | null;
  salesSyncStatus: string | null;
}

// Segurança contra período customizado enorme numa máquina de altíssimo
// volume — o card já resolve hoje/7d/30d via machine_consumption_daily
// (poucas linhas), só o detalhamento por produto varre machine_sales de
// verdade; capado pra nunca puxar um período ilimitado de vendas pra
// memória da Function.
const MAX_PRODUCT_ROWS = 20_000;

export async function getMachineConsumption(
  db: SupabaseClient,
  auvoEquipmentId: number,
  { startDate, endDate }: { startDate: string; endDate: string }
): Promise<ConsumptionResult> {
  const [{ data: registry, error: registryError }, registrySync, salesSync] = await Promise.all([
    db.from("machine_patrimony_registry").select("*").eq("auvo_equipment_id", auvoEquipmentId).maybeSingle() as unknown as Promise<{
      data: RegistryRow | null;
      error: { message: string } | null;
    }>,
    readSyncStatus(db, "vmpay_registry_sync", "status", "error"),
    readSyncStatus(db, "vmpay_sales_sync", "status", "error"),
  ]);

  if (registryError) throw new ControlledError(`Falha ao consultar o cruzamento Auvo × VMpay: ${registryError.message}`, 502);

  const base = {
    startDate,
    endDate,
    totalQuantity: 0,
    totalSales: 0,
    byDay: [] as ConsumptionResult["byDay"],
    byProduct: [] as ConsumptionResult["byProduct"],
    registrySyncedAt: registrySync.syncedAt,
    registrySyncStatus: registrySync.status,
    salesSyncedAt: salesSync.syncedAt,
    salesSyncStatus: salesSync.status,
  };

  // Ainda não sincronizado (registry-sync nunca rodou pra esta máquina) —
  // diferente de NOT_FOUND, que é um resultado real de cruzamento.
  if (!registry) {
    return { ...base, matchStatus: "NOT_COMPUTED", vmpayMachineId: null, vmpayAssetNumber: null, vmpayMachineModelId: null, candidateCount: 0 };
  }

  // NOT_FOUND/DUPLICATE: não tem como saber com segurança qual máquina
  // VMpay é esta — nunca adivinha, só reporta o status (seção 46 do pedido
  // original de Operação Completa, mesmo princípio aqui).
  if (registry.match_status === "NOT_FOUND" || registry.match_status === "DUPLICATE") {
    return {
      ...base,
      matchStatus: registry.match_status,
      vmpayMachineId: null,
      vmpayAssetNumber: null,
      vmpayMachineModelId: null,
      candidateCount: registry.candidate_count,
    };
  }

  const patrimony = registry.normalized_patrimony;

  const { data: dailyRows, error: dailyError } = await db
    .from("machine_consumption_daily")
    .select("consumption_date, quantity, sales_count")
    .eq("normalized_patrimony", patrimony)
    .gte("consumption_date", startDate)
    .lte("consumption_date", endDate)
    .order("consumption_date", { ascending: true });
  if (dailyError) throw new ControlledError(`Falha ao consultar consumo diário: ${dailyError.message}`, 502);

  const byDay = (dailyRows ?? []).map((r) => ({
    date: r.consumption_date as string,
    quantity: Number(r.quantity),
    salesCount: Number(r.sales_count),
  }));
  const totalQuantity = byDay.reduce((sum, d) => sum + d.quantity, 0);
  const totalSales = byDay.reduce((sum, d) => sum + d.salesCount, 0);

  // Início/fim do dia em Brasília, convertido pra UTC — machine_sales.occurred_at
  // é UTC puro (confirmado ao vivo), nunca comparado como string.
  const rangeStartUtc = new Date(`${startDate}T00:00:00-03:00`).toISOString();
  const rangeEndUtc = new Date(`${endDate}T23:59:59.999-03:00`).toISOString();

  const { data: productRows, error: productError } = await db
    .from("machine_sales")
    .select("product_name, quantity")
    .eq("normalized_patrimony", patrimony)
    .gte("occurred_at", rangeStartUtc)
    .lte("occurred_at", rangeEndUtc)
    .limit(MAX_PRODUCT_ROWS);
  if (productError) throw new ControlledError(`Falha ao consultar consumo por produto: ${productError.message}`, 502);

  const byProductMap = new Map<string, { quantity: number; salesCount: number }>();
  for (const row of productRows ?? []) {
    const name = (row.product_name as string) || "Não informado";
    const entry = byProductMap.get(name) ?? { quantity: 0, salesCount: 0 };
    entry.quantity += Number(row.quantity) || 0;
    entry.salesCount += 1;
    byProductMap.set(name, entry);
  }
  const byProduct = Array.from(byProductMap.entries())
    .map(([productName, v]) => ({ productName, ...v }))
    .sort((a, b) => b.quantity - a.quantity);

  return {
    ...base,
    matchStatus: registry.match_status,
    vmpayMachineId: registry.vmpay_machine_id,
    vmpayAssetNumber: registry.vmpay_asset_number,
    vmpayMachineModelId: registry.vmpay_machine_model_id,
    candidateCount: registry.candidate_count,
    totalQuantity,
    totalSales,
    byDay,
    byProduct,
  };
}

export interface CustomerConsumptionMachine {
  auvoEquipmentId: number;
  name: string | null;
  identifier: string | null;
  normalizedPatrimony: string | null;
  matchStatus: string;
  quantity: number;
  salesCount: number;
}

export interface CustomerConsumptionResult {
  startDate: string;
  endDate: string;
  totalQuantity: number;
  totalSales: number;
  byDay: Array<{ date: string; quantity: number; salesCount: number }>;
  machines: CustomerConsumptionMachine[];
  salesSyncedAt: string | null;
  salesSyncStatus: string | null;
}

interface EquipmentRow {
  auvo_id: number;
  name: string | null;
  identifier: string | null;
}

// Soma o consumo de TODAS as máquinas casadas de um cliente — nunca por
// produto aqui (um cliente grande, ex.: 300+ máquinas × 90 dias, geraria
// centenas de milhares de linhas de venda só pra montar esse
// detalhamento; por máquina isso já existe em getMachineConsumption). A
// soma por dia e por máquina roda inteira no Postgres (customer_consumption_*),
// nunca varrendo linha a linha na Function.
export async function getCustomerConsumption(
  db: SupabaseClient,
  auvoCustomerId: number,
  { startDate, endDate }: { startDate: string; endDate: string }
): Promise<CustomerConsumptionResult> {
  const [{ data: equipmentRows, error: equipmentError }, salesSync] = await Promise.all([
    db.from("auvo_equipments").select("auvo_id, name, identifier").eq("associated_customer_id", auvoCustomerId) as unknown as Promise<{
      data: EquipmentRow[] | null;
      error: { message: string } | null;
    }>,
    readSyncStatus(db, "vmpay_sales_sync", "status", "error"),
  ]);
  if (equipmentError) throw new ControlledError(`Falha ao consultar máquinas do cliente: ${equipmentError.message}`, 502);

  const equipments = equipmentRows ?? [];
  const base = {
    startDate,
    endDate,
    totalQuantity: 0,
    totalSales: 0,
    byDay: [] as CustomerConsumptionResult["byDay"],
    salesSyncedAt: salesSync.syncedAt,
    salesSyncStatus: salesSync.status,
  };

  if (equipments.length === 0) return { ...base, machines: [] };

  const equipmentIds = equipments.map((e) => e.auvo_id);
  const { data: registryRows, error: registryError } = await db
    .from("machine_patrimony_registry")
    .select("auvo_equipment_id, normalized_patrimony, match_status")
    .in("auvo_equipment_id", equipmentIds);
  if (registryError) throw new ControlledError(`Falha ao consultar o cruzamento Auvo × VMpay: ${registryError.message}`, 502);

  const registryByEquipment = new Map(
    (registryRows ?? []).map((r) => [r.auvo_equipment_id as number, r as { normalized_patrimony: string; match_status: string }])
  );
  const matchedPatrimonies = Array.from(
    new Set(
      (registryRows ?? [])
        .filter((r) => r.match_status === "MATCH" || r.match_status === "MATCH_NORMALIZED")
        .map((r) => r.normalized_patrimony as string)
    )
  );

  const machinesBase: CustomerConsumptionMachine[] = equipments.map((e) => {
    const reg = registryByEquipment.get(e.auvo_id);
    return {
      auvoEquipmentId: e.auvo_id,
      name: e.name,
      identifier: e.identifier,
      normalizedPatrimony: reg?.normalized_patrimony ?? null,
      matchStatus: reg?.match_status ?? "NOT_COMPUTED",
      quantity: 0,
      salesCount: 0,
    };
  });

  if (matchedPatrimonies.length === 0) return { ...base, machines: machinesBase };

  const [{ data: dailyRows, error: dailyError }, { data: byMachineRows, error: byMachineError }] = await Promise.all([
    db.rpc("customer_consumption_daily_summary", { p_patrimonies: matchedPatrimonies, p_start: startDate, p_end: endDate }),
    db.rpc("customer_consumption_by_machine", { p_patrimonies: matchedPatrimonies, p_start: startDate, p_end: endDate }),
  ]);
  if (dailyError) throw new ControlledError(`Falha ao consultar consumo diário do cliente: ${dailyError.message}`, 502);
  if (byMachineError) throw new ControlledError(`Falha ao consultar consumo por máquina: ${byMachineError.message}`, 502);

  const byDay = (dailyRows ?? []).map((r: Record<string, unknown>) => ({
    date: r.consumption_date as string,
    quantity: Number(r.quantity),
    salesCount: Number(r.sales_count),
  }));
  const totalQuantity = byDay.reduce((sum, d) => sum + d.quantity, 0);
  const totalSales = byDay.reduce((sum, d) => sum + d.salesCount, 0);

  const quantityByPatrimony = new Map(
    (byMachineRows ?? []).map((r: Record<string, unknown>) => [r.normalized_patrimony as string, r as Record<string, unknown>])
  );
  const machines = machinesBase.map((m) => {
    const row = m.normalizedPatrimony ? quantityByPatrimony.get(m.normalizedPatrimony) : undefined;
    return row ? { ...m, quantity: Number(row.quantity), salesCount: Number(row.sales_count) } : m;
  });

  return { ...base, totalQuantity, totalSales, byDay, machines };
}

export interface InconsistencyRow {
  auvoEquipmentId: number;
  auvoIdentifier: string | null;
  equipmentName: string | null;
  normalizedPatrimony: string;
  vmpayAssetNumber: string | null;
  matchStatus: string;
  candidateCount: number;
}

export async function getRegistryInconsistencies(
  db: SupabaseClient,
  page: number,
  pageSize: number
): Promise<{ items: InconsistencyRow[]; total: number; page: number; pageSize: number }> {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await db
    .from("machine_patrimony_registry")
    .select("auvo_equipment_id, auvo_identifier, normalized_patrimony, vmpay_asset_number, match_status, candidate_count", {
      count: "exact",
    })
    .neq("match_status", "MATCH")
    .order("match_status", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw new ControlledError(`Falha ao consultar inconsistências: ${error.message}`, 502);

  const equipmentIds = (data ?? []).map((r) => r.auvo_equipment_id as number);
  const { data: equipments } = equipmentIds.length
    ? await db.from("auvo_equipments").select("auvo_id, name").in("auvo_id", equipmentIds)
    : { data: [] as { auvo_id: number; name: string | null }[] };
  const nameById = new Map((equipments ?? []).map((e) => [e.auvo_id, e.name]));

  return {
    items: (data ?? []).map((r) => ({
      auvoEquipmentId: r.auvo_equipment_id as number,
      auvoIdentifier: (r.auvo_identifier as string) ?? null,
      equipmentName: nameById.get(r.auvo_equipment_id as number) ?? null,
      normalizedPatrimony: r.normalized_patrimony as string,
      vmpayAssetNumber: (r.vmpay_asset_number as string) ?? null,
      matchStatus: r.match_status as string,
      candidateCount: r.candidate_count as number,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}
