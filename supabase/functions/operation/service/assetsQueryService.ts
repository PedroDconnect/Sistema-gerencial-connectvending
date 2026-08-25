import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";
import { AssetsListFilters, CustomersListFilters, MapFilters } from "./assetsFilters.ts";

// PostgREST usa "," "(" ")" como sintaxe de filtro dentro de .or(...) — sem
// isso, um termo de busca com esses caracteres poderia injetar condições
// extras na query em vez de só ser tratado como texto. Removidos antes de
// montar o padrão ilike (nenhum nome de máquina/cliente real depende
// desses caracteres pra ser encontrado).
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, " ").trim();
}

export interface AssetRow {
  equipmentId: number;
  equipmentName: string | null;
  identifier: string | null;
  description: string | null;
  equipmentActive: boolean;
  categoryId: number | null;
  creationDate: string | null;
  customerId: number | null;
  customerName: string | null;
  customerActive: boolean | null;
  city: string | null;
  state: string | null;
}

function toAssetRow(row: Record<string, unknown>): AssetRow {
  return {
    equipmentId: row.equipment_id as number,
    equipmentName: (row.equipment_name as string) ?? null,
    identifier: (row.identifier as string) ?? null,
    // "Local interno" (5º andar, recepção etc.) — a Auvo não tem campo
    // dedicado pra isso, reaproveita o "description" do equipamento.
    description: (row.description as string) || null,
    equipmentActive: row.equipment_active === true,
    categoryId: (row.category_id as number) ?? null,
    creationDate: (row.creation_date as string) ?? null,
    customerId: (row.customer_id as number) ?? null,
    customerName: (row.customer_name as string) ?? null,
    customerActive: row.customer_id != null ? row.customer_active === true : null,
    city: (row.customer_city as string) ?? null,
    state: (row.customer_state as string) ?? null,
  };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listAssets(
  db: SupabaseClient,
  filters: AssetsListFilters,
  page: number,
  pageSize: number
): Promise<Page<AssetRow>> {
  let query = db.from("auvo_assets_view").select("*", { count: "exact" });

  if (filters.active !== undefined) query = query.eq("equipment_active", filters.active);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.models?.length) query = query.in("equipment_name", filters.models);
  if (filters.customers?.length) query = query.in("customer_name", filters.customers);
  if (filters.states?.length) query = query.in("customer_state", filters.states);
  if (filters.linkStatus === "with_customer") query = query.not("customer_id", "is", null);
  if (filters.linkStatus === "without_customer") query = query.is("customer_id", null);
  if (filters.search) {
    const term = sanitizeSearchTerm(filters.search);
    // description = "Local interno" (seção da máquina dentro do site do
    // cliente, ex.: "5º andar", "recepção") — passa a ser preenchido a
    // partir de agora, então já entra na busca.
    query = query.or(
      `equipment_name.ilike.%${term}%,identifier.ilike.%${term}%,customer_name.ilike.%${term}%,description.ilike.%${term}%`
    );
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("equipment_id", { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) throw new ControlledError(`Falha ao consultar ativos: ${error.message}`, 502);
  return { items: (data ?? []).map(toAssetRow), total: count ?? 0, page, pageSize };
}

// Opções pra popular os MultiSelects de Modelo/Cliente do frontend sem
// baixar as ~2.400 linhas inteiras pro browser só pra montar um dropdown —
// só a coluna necessária, distinct feito aqui (poucas centenas de valores
// no máximo, não justifica uma view dedicada de DISTINCT).
export interface AssetFilterOptions {
  models: string[];
  customers: string[];
  states: string[];
}

export async function getAssetFilterOptions(db: SupabaseClient): Promise<AssetFilterOptions> {
  const [modelsRes, customersRes, statesRes] = await Promise.all([
    db.from("auvo_equipments").select("name").not("name", "is", null),
    db.from("auvo_customers").select("description").not("description", "is", null),
    db.from("auvo_customers").select("state").not("state", "is", null),
  ]);

  if (modelsRes.error) throw new ControlledError(`Falha ao consultar modelos: ${modelsRes.error.message}`, 502);
  if (customersRes.error) throw new ControlledError(`Falha ao consultar clientes: ${customersRes.error.message}`, 502);
  if (statesRes.error) throw new ControlledError(`Falha ao consultar estados: ${statesRes.error.message}`, 502);

  const distinct = (rows: Record<string, unknown>[] | null, key: string) =>
    Array.from(new Set((rows ?? []).map((r) => r[key] as string).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return {
    models: distinct(modelsRes.data, "name"),
    customers: distinct(customersRes.data, "description"),
    states: distinct(statesRes.data, "state"),
  };
}

export async function getAssetDetail(db: SupabaseClient, auvoId: number): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from("auvo_assets_view").select("*").eq("equipment_id", auvoId).maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar o ativo: ${error.message}`, 502);
  if (!data) return null;

  const { data: raw } = await db.from("auvo_equipments").select("raw_data").eq("auvo_id", auvoId).maybeSingle();
  return { ...toAssetRow(data), equipmentSpecifications: data.equipment_specifications, urlImage: data.url_image, rawData: raw?.raw_data ?? null };
}

export interface CustomerRow {
  customerId: number;
  name: string | null;
  active: boolean;
  city: string | null;
  state: string | null;
  equipmentCount: number;
}

function toCustomerRow(row: Record<string, unknown>): CustomerRow {
  return {
    customerId: row.auvo_id as number,
    name: (row.description as string) ?? null,
    active: row.active === true,
    city: (row.city as string) ?? null,
    state: (row.state as string) ?? null,
    equipmentCount: Number(row.equipment_count ?? 0),
  };
}

export async function listCustomers(
  db: SupabaseClient,
  filters: CustomersListFilters,
  page: number,
  pageSize: number
): Promise<Page<CustomerRow>> {
  let query = db.from("auvo_customers_view").select("*", { count: "exact" });

  if (filters.active !== undefined) query = query.eq("active", filters.active);
  if (filters.equipmentStatus === "with_equipment") query = query.gt("equipment_count", 0);
  if (filters.equipmentStatus === "without_equipment") query = query.eq("equipment_count", 0);
  if (filters.search) {
    const term = sanitizeSearchTerm(filters.search);
    query = query.or(`description.ilike.%${term}%,cpf_cnpj.ilike.%${term}%`);
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("description", { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) throw new ControlledError(`Falha ao consultar clientes: ${error.message}`, 502);
  return { items: (data ?? []).map(toCustomerRow), total: count ?? 0, page, pageSize };
}

// contacts[0] é o único lugar confiável de telefone/e-mail (os campos
// phoneNumber/email no topo do objeto vieram vazios nos dados reais) — lido
// direto do raw_data só na leitura individual, nunca normalizado em coluna
// (não faz sentido filtrar/indexar por isso).
function primaryContact(rawData: Record<string, unknown> | null): { phone: string | null; email: string | null } {
  const contacts = rawData?.contacts;
  const first = Array.isArray(contacts) ? (contacts[0] as Record<string, unknown> | undefined) : undefined;
  return {
    phone: (first?.phone as string) || null,
    email: (first?.email as string) || null,
  };
}

export async function getCustomerDetail(db: SupabaseClient, auvoId: number): Promise<Record<string, unknown> | null> {
  const { data: customer, error } = await db.from("auvo_customers").select("*").eq("auvo_id", auvoId).maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar o cliente: ${error.message}`, 502);
  if (!customer) return null;

  const { data: equipments, error: eqError } = await db
    .from("auvo_equipments")
    .select("auvo_id, name, identifier, active, creation_date")
    .eq("associated_customer_id", auvoId)
    .order("name", { ascending: true });
  if (eqError) throw new ControlledError(`Falha ao consultar equipamentos do cliente: ${eqError.message}`, 502);

  return {
    customerId: customer.auvo_id,
    name: customer.description,
    legalName: customer.legal_name,
    active: customer.active,
    cpfCnpj: customer.cpf_cnpj,
    address: customer.address,
    city: customer.city,
    state: customer.state,
    creationDate: customer.creation_date,
    dateLastUpdate: customer.date_last_update,
    ...primaryContact(customer.raw_data as Record<string, unknown> | null),
    equipments: (equipments ?? []).map((e) => ({
      equipmentId: e.auvo_id,
      name: e.name,
      identifier: e.identifier,
      active: e.active,
      creationDate: e.creation_date,
    })),
  };
}

export interface MapPoint {
  equipmentId: number;
  equipmentName: string | null;
  equipmentActive: boolean;
  customerId: number | null;
  customerName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
}

const MAP_SELECT =
  "equipment_id, equipment_name, equipment_active, customer_id, customer_name, customer_address, customer_city, customer_state, customer_latitude, customer_longitude";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mesmo caso de countRows: tipo muda a cada .eq()/.in() encadeado.
function applyMapFilters(query: any, filters: MapFilters): any {
  let q = query;
  if (filters.active !== undefined) q = q.eq("equipment_active", filters.active);
  if (filters.customerId) q = q.eq("customer_id", filters.customerId);
  if (filters.models?.length) q = q.in("equipment_name", filters.models);
  if (filters.customers?.length) q = q.in("customer_name", filters.customers);
  if (filters.states?.length) q = q.in("customer_state", filters.states);
  return q;
}

function toMapPoint(row: Record<string, unknown>): MapPoint {
  return {
    equipmentId: row.equipment_id as number,
    equipmentName: (row.equipment_name as string) ?? null,
    equipmentActive: row.equipment_active === true,
    customerId: (row.customer_id as number) ?? null,
    customerName: (row.customer_name as string) ?? null,
    address: (row.customer_address as string) ?? null,
    city: (row.customer_city as string) ?? null,
    state: (row.customer_state as string) ?? null,
    latitude: row.customer_latitude as number,
    longitude: row.customer_longitude as number,
  };
}

export async function listMapPoints(db: SupabaseClient, filters: MapFilters): Promise<MapPoint[]> {
  const base = db
    .from("auvo_assets_view")
    .select(MAP_SELECT)
    .not("customer_latitude", "is", null)
    .not("customer_longitude", "is", null);

  const { data, error } = await applyMapFilters(base, filters);
  if (error) throw new ControlledError(`Falha ao consultar o mapa: ${error.message}`, 502);

  return (data ?? []).map(toMapPoint);
}

// Transparência pedida explicitamente: em vez de simplesmente sumir do
// mapa, o total de máquinas que não aparecem (sem cliente OU sem
// coordenadas cadastradas) é exposto — nunca escondido (mesmo espírito da
// seção 42/45 do pedido original: falha/lacuna de dado sempre visível).
export async function countAssetsWithoutMapLocation(db: SupabaseClient, filters: MapFilters): Promise<number> {
  const base = db
    .from("auvo_assets_view")
    .select("*", { count: "exact", head: true })
    .or("customer_latitude.is.null,customer_longitude.is.null");

  const { count, error } = await applyMapFilters(base, filters);
  if (error) throw new ControlledError(`Falha ao contar máquinas sem localização: ${error.message}`, 502);
  return count ?? 0;
}

export interface AssetsOverview {
  customers: { total: number; active: number; inactive: number; withoutEquipment: number };
  equipment: { total: number; active: number; inactive: number; withoutCustomer: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do
// PostgrestFilterBuilder muda a cada .eq()/.gt() encadeado; tipar isso de
// verdade exigiria repetir a assinatura inteira da lib só pra esse helper
// interno de contagem.
async function countRows(db: SupabaseClient, table: string, apply: (q: any) => any): Promise<number> {
  const query = apply(db.from(table).select("*", { count: "exact", head: true }));
  const { count, error } = await query;
  if (error) throw new ControlledError(`Falha ao contar ${table}: ${error.message}`, 502);
  return count ?? 0;
}

export async function getAssetsOverview(db: SupabaseClient): Promise<AssetsOverview> {
  const [customersTotal, customersActive, customersWithoutEquipment, equipmentTotal, equipmentActive, equipmentWithoutCustomer] =
    await Promise.all([
      countRows(db, "auvo_customers", (q) => q),
      countRows(db, "auvo_customers", (q) => q.eq("active", true)),
      countRows(db, "auvo_customers_view", (q) => q.eq("equipment_count", 0)),
      countRows(db, "auvo_equipments", (q) => q),
      countRows(db, "auvo_equipments", (q) => q.eq("active", true)),
      countRows(db, "auvo_assets_view", (q) => q.is("customer_id", null)),
    ]);

  return {
    customers: {
      total: customersTotal,
      active: customersActive,
      inactive: customersTotal - customersActive,
      withoutEquipment: customersWithoutEquipment,
    },
    equipment: {
      total: equipmentTotal,
      active: equipmentActive,
      inactive: equipmentTotal - equipmentActive,
      withoutCustomer: equipmentWithoutCustomer,
    },
  };
}
