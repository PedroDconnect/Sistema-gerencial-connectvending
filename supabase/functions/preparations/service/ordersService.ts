import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";
import { CallerInfo } from "../shared/auth.ts";
import { writeLog } from "./logService.ts";
import { getActiveTemplate, TemplateRow } from "./templatesService.ts";
import { sendFormToAuvo, regenerateDocument, toFormRow, FormRow, OrderContext } from "./formsService.ts";
import { readAuvoCredentials } from "../integrations/auvo/auvo.config.ts";
import { syncTicketStatus } from "../integrations/auvo/auvoTickets.ts";

export interface OrderListRow {
  id: string;
  code: string;
  customerName: string | null;
  formCount: number;
  ticketsCreated: number;
  status: string;
  createdAt: string;
}

export interface OrderDetailRow extends OrderListRow {
  customerId: number;
  auvoCustomerId: number;
  requestedByName: string | null;
  requestedByEmail: string | null;
  updatedAt: string;
  forms: FormRow[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toOrderListRow(row: Record<string, unknown>): OrderListRow {
  const customer = row.auvo_customers as { description?: string } | null;
  const forms = (row.preparation_forms as { status: string; auvo_ticket_id: number | null }[]) ?? [];
  return {
    id: row.id as string,
    code: row.code as string,
    customerName: customer?.description ?? null,
    formCount: row.form_count as number,
    ticketsCreated: forms.filter((f) => f.auvo_ticket_id !== null).length,
    status: row.status as string,
    createdAt: row.created_at as string,
  };
}

// Padrão de listagem paginada de getRegistryInconsistencies
// (operation/service/consumptionQueryService.ts): from=(page-1)*pageSize,
// count:"exact", range(). auvo_customers(...)/preparation_forms(...) são
// embeds automáticos do PostgREST via FK (customer_id/preparation_order_id
// já declaradas em schema.sql) — sem N+1 manual.
export async function listOrders(db: SupabaseClient, page: number, pageSize: number): Promise<{ items: OrderListRow[]; total: number; page: number; pageSize: number }> {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await db
    .from("preparation_orders")
    .select("*, auvo_customers(description), preparation_forms(status, auvo_ticket_id)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new ControlledError(`Falha ao listar pedidos: ${error.message}`, 502);
  return { items: (data ?? []).map(toOrderListRow), total: count ?? 0, page, pageSize };
}

export async function getOrderDetail(db: SupabaseClient, orderId: string): Promise<OrderDetailRow> {
  const { data, error } = await db
    .from("preparation_orders")
    .select("*, auvo_customers(description), preparation_forms(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar pedido: ${error.message}`, 502);
  if (!data) throw new ControlledError("Pedido não encontrado.", 404);

  const forms = ((data.preparation_forms as Record<string, unknown>[]) ?? []).map(toFormRow).sort((a, b) => a.sequence - b.sequence);
  return {
    ...toOrderListRow(data),
    customerId: data.customer_id as number,
    auvoCustomerId: data.auvo_customer_id as number,
    requestedByName: (data.requested_by_name as string) ?? null,
    requestedByEmail: (data.requested_by_email as string) ?? null,
    updatedAt: data.updated_at as string,
    forms,
  };
}

async function toOrderContext(db: SupabaseClient, orderId: string): Promise<{ order: Record<string, unknown>; context: OrderContext }> {
  const { data, error } = await db.from("preparation_orders").select("*, auvo_customers(description)").eq("id", orderId).maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar pedido: ${error.message}`, 502);
  if (!data) throw new ControlledError("Pedido não encontrado.", 404);
  const customer = data.auvo_customers as { description?: string } | null;
  return {
    order: data,
    context: {
      id: data.id as string,
      code: data.code as string,
      customerName: customer?.description ?? "Cliente",
      auvoCustomerId: data.auvo_customer_id as number,
      formCount: data.form_count as number,
      requestedByName: (data.requested_by_name as string) ?? null,
      requestedByEmail: (data.requested_by_email as string) ?? null,
    },
  };
}

async function recomputeOrderStatus(db: SupabaseClient, orderId: string): Promise<string> {
  const { data, error } = await db.from("preparation_forms").select("status").eq("preparation_order_id", orderId);
  if (error) throw new ControlledError(`Falha ao recalcular status do pedido: ${error.message}`, 502);
  const statuses = (data ?? []).map((f) => f.status as string);
  const sentCount = statuses.filter((s) => s === "SENT_TO_AUVO" || s === "IN_PROGRESS" || s === "COMPLETED").length;
  const errorCount = statuses.filter((s) => s === "ERROR").length;

  let status: string;
  if (sentCount === statuses.length) status = "SENT";
  else if (sentCount === 0 && errorCount === statuses.length) status = "ERROR";
  else if (sentCount > 0 || errorCount > 0) status = "PARTIALLY_SENT";
  else status = "PROCESSING";

  await db.from("preparation_orders").update({ status, updated_at: new Date().toISOString() }).eq("id", orderId);
  return status;
}

function requireNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// Valida os campos obrigatórios do template contra o resultado já
// mesclado (base + ajuste por ficha) — não importa se um campo
// obrigatório veio do baseForm ou de um override específico da ficha, só
// importa que o valor final não esteja vazio (spec seção 4.4: campos
// perForm só aparecem individualmente na tela, mas continuam obrigatórios
// como qualquer outro).
function validateMergedForm(template: TemplateRow, merged: Record<string, unknown>, formLabel: string): void {
  for (const field of template.schema.fields) {
    if (field.required && !requireNonEmpty(merged[field.key])) {
      throw new ControlledError(`${formLabel}: campo obrigatório "${field.label}" não preenchido.`, 400);
    }
  }
}

export interface CreateOrderFormInput {
  internalLocation: string;
  overrides?: Record<string, unknown>;
}

export interface CreateOrderInput {
  customerId: number; // auvo_customers.id (interno)
  requestedByName?: string;
  requestedByEmail?: string;
  baseForm: Record<string, unknown>; // chaves = template field keys (snake_case, ver nota abaixo)
  forms: CreateOrderFormInput[];
}

// NOTA sobre o formato de baseForm/overrides: a spec (seção 18.1) dá um
// exemplo em camelCase (contractNumber, installationForecast...), mas o
// template (seção 5, schema dinâmico) usa chaves snake_case
// (contract_number, installation_forecast...). Como o formulário é
// dirigido pelo schema do template — e um admin pode adicionar um campo
// novo a qualquer momento, sem contrapartida camelCase nenhuma pra
// inventar — o contrato real desta API usa as MESMAS chaves do template
// (schema.fields[].key) direto, sem camada de tradução. Documentado aqui
// porque é uma adaptação da spec, não uma cópia literal do payload dela.
export async function createOrder(db: SupabaseClient, caller: CallerInfo, input: CreateOrderInput) {
  if (!Array.isArray(input.forms) || input.forms.length === 0) {
    throw new ControlledError("O pedido precisa de pelo menos 1 ficha.", 400);
  }
  for (const form of input.forms) {
    if (!form.internalLocation || !form.internalLocation.trim()) {
      throw new ControlledError("Toda ficha precisa de um Local Interno da Máquina.", 400);
    }
  }

  const { data: customer, error: customerError } = await db
    .from("auvo_customers")
    .select("id, auvo_id, description")
    .eq("id", input.customerId)
    .maybeSingle();
  if (customerError) throw new ControlledError(`Falha ao consultar cliente: ${customerError.message}`, 502);
  if (!customer) throw new ControlledError("Cliente não encontrado.", 404);

  const template = await getActiveTemplate(db);

  // internal_location entra na validação (é um campo do template, marcado
  // required/perForm) mas NÃO no form_data guardado — já tem coluna
  // própria (preparation_forms.internal_location), guardar duas vezes
  // seria redundante.
  const mergedByForm = input.forms.map((form, index) => {
    const overrides = form.overrides ?? {};
    const forValidation = { ...input.baseForm, internal_location: form.internalLocation, ...overrides };
    validateMergedForm(template, forValidation, `Ficha ${pad(index + 1)}`);
    return { ...input.baseForm, ...overrides };
  });

  const requestedByName = input.requestedByName ?? caller.name ?? caller.email;
  const requestedByEmail = input.requestedByEmail ?? caller.email;

  const { data: order, error: orderError } = await db
    .from("preparation_orders")
    .insert({
      customer_id: customer.id,
      auvo_customer_id: customer.auvo_id,
      requested_by: caller.id,
      requested_by_name: requestedByName,
      requested_by_email: requestedByEmail,
      form_count: input.forms.length,
      status: "PROCESSING",
    })
    .select("*")
    .single();
  if (orderError) throw new ControlledError(`Falha ao criar pedido: ${orderError.message}`, 502);

  await writeLog(db, { orderId: order.id, action: "ORDER_CREATED", caller, metadata: { formCount: input.forms.length, customerId: customer.id } });

  const formRows: FormRow[] = [];
  for (let i = 0; i < input.forms.length; i++) {
    const sequence = i + 1;
    const externalId = `${order.code}-F${pad(sequence)}`;
    const { data: formRow, error: formError } = await db
      .from("preparation_forms")
      .insert({
        preparation_order_id: order.id,
        sequence,
        template_id: template.id,
        template_version: template.version,
        internal_location: input.forms[i].internalLocation,
        form_data: mergedByForm[i],
        status: "READY",
        external_id: externalId,
        created_by: caller.id,
      })
      .select("*")
      .single();
    if (formError) throw new ControlledError(`Falha ao criar ficha ${pad(sequence)}: ${formError.message}`, 502);
    formRows.push(toFormRow(formRow));
    await writeLog(db, { orderId: order.id, formId: formRow.id, action: "FORM_CREATED", caller, metadata: { sequence, externalId } });
  }

  // Sequencial, não em paralelo — mesma cautela já documentada em
  // operation/integrations/auvo/auvo.config.ts (AUVO_CONCURRENCY_LIMIT):
  // disparar várias chamadas simultâneas contra a Auvo com o mesmo token
  // já causou instabilidade confirmada em outro módulo deste projeto. Uma
  // ficha falhar não impede as seguintes (spec seção 12) — sendFormToAuvo
  // nunca relança, sempre devolve o form com status ERROR nesse caso.
  const context: OrderContext = {
    id: order.id,
    code: order.code,
    customerName: customer.description ?? "Cliente",
    auvoCustomerId: customer.auvo_id,
    formCount: input.forms.length,
    requestedByName,
    requestedByEmail,
  };
  const sentForms: FormRow[] = [];
  for (const form of formRows) {
    sentForms.push(await sendFormToAuvo(db, form, context, caller));
  }

  const finalStatus = await recomputeOrderStatus(db, order.id);
  return { ...(await getOrderDetail(db, order.id)), status: finalStatus };
}

// Botão manual "Tentar novamente" (spec seção 12) — reenvia só 1 ficha,
// idempotente (sendFormToAuvo não recria o que já existe).
export async function retryForm(db: SupabaseClient, orderId: string, formId: string, caller: CallerInfo): Promise<FormRow> {
  const { context } = await toOrderContext(db, orderId);
  const { data: formData, error } = await db.from("preparation_forms").select("*").eq("id", formId).eq("preparation_order_id", orderId).maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar ficha: ${error.message}`, 502);
  if (!formData) throw new ControlledError("Ficha não encontrada.", 404);

  const result = await sendFormToAuvo(db, toFormRow(formData), context, caller);
  await recomputeOrderStatus(db, orderId);
  return result;
}

// "Regerar documento" (spec seção 15/17) — gera v2+ do PDF e tenta
// reanexar automaticamente no ticket já existente.
export async function regenerateFormDocument(
  db: SupabaseClient,
  orderId: string,
  formId: string,
  caller: CallerInfo,
  newFormData?: Record<string, unknown>
): Promise<FormRow> {
  const { context } = await toOrderContext(db, orderId);
  const { data: formData, error } = await db.from("preparation_forms").select("*").eq("id", formId).eq("preparation_order_id", orderId).maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar ficha: ${error.message}`, 502);
  if (!formData) throw new ControlledError("Ficha não encontrada.", 404);

  return regenerateDocument(db, toFormRow(formData), context, caller, newFormData);
}

// Botão manual "Atualizar Auvo" (spec seção 14.1) — sem job automático
// nesta versão (decisão registrada no plano). Consulta só as fichas com
// ticket já criado; ficha sem ticket (ainda em erro antes de chegar lá)
// não tem o que sincronizar.
export async function syncOrderWithAuvo(db: SupabaseClient, orderId: string, caller: CallerInfo): Promise<OrderDetailRow> {
  const { data: forms, error } = await db
    .from("preparation_forms")
    .select("id, auvo_ticket_id")
    .eq("preparation_order_id", orderId)
    .not("auvo_ticket_id", "is", null);
  if (error) throw new ControlledError(`Falha ao consultar fichas do pedido: ${error.message}`, 502);

  const creds = readAuvoCredentials();
  for (const form of forms ?? []) {
    try {
      const status = await syncTicketStatus(db, creds, form.auvo_ticket_id as number);
      await db
        .from("preparation_forms")
        .update({
          auvo_ticket_status_id: status.statusId,
          auvo_ticket_status_name: status.statusName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", form.id);
      await writeLog(db, { orderId, formId: form.id as string, action: "AUVO_STATUS_UPDATED", caller, metadata: status });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Falha desconhecida ao sincronizar com a Auvo.";
      await writeLog(db, { orderId, formId: form.id as string, action: "ERROR", caller, metadata: { step: "sync", message } });
    }
  }

  return getOrderDetail(db, orderId);
}
