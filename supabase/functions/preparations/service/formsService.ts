import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";
import { CallerInfo } from "../shared/auth.ts";
import { writeLog } from "./logService.ts";
import { getTemplateById } from "./templatesService.ts";
import { generatePreparationFormPdf } from "./pdfService.ts";
import { uploadDocument, downloadDocument } from "./storageService.ts";
import { readAuvoCredentials } from "../integrations/auvo/auvo.config.ts";
import { createTicket, attachDocument } from "../integrations/auvo/auvoTickets.ts";

export interface FormRow {
  id: string;
  preparationOrderId: string;
  sequence: number;
  templateId: string;
  templateVersion: number;
  internalLocation: string;
  formData: Record<string, unknown>;
  status: string;
  documentPath: string | null;
  documentVersion: number;
  externalId: string;
  auvoTicketId: number | null;
  auvoTicketStatusId: number | null;
  auvoTicketStatusName: string | null;
  createdAt: string;
  finalizedAt: string | null;
}

// Contexto mínimo do pedido que uma ficha precisa pra falar com a Auvo —
// não o objeto inteiro, só o que entra no título/descrição/ticket.
export interface OrderContext {
  id: string;
  code: string;
  customerName: string;
  auvoCustomerId: number;
  formCount: number;
  requestedByName: string | null;
  requestedByEmail: string | null;
}

export function toFormRow(row: Record<string, unknown>): FormRow {
  return {
    id: row.id as string,
    preparationOrderId: row.preparation_order_id as string,
    sequence: row.sequence as number,
    templateId: row.template_id as string,
    templateVersion: row.template_version as number,
    internalLocation: row.internal_location as string,
    formData: (row.form_data as Record<string, unknown>) ?? {},
    status: row.status as string,
    documentPath: (row.document_path as string) ?? null,
    documentVersion: row.document_version as number,
    externalId: row.external_id as string,
    auvoTicketId: (row.auvo_ticket_id as number) ?? null,
    auvoTicketStatusId: (row.auvo_ticket_status_id as number) ?? null,
    auvoTicketStatusName: (row.auvo_ticket_status_name as string) ?? null,
    createdAt: row.created_at as string,
    finalizedAt: (row.finalized_at as string) ?? null,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

async function updateFormRow(db: SupabaseClient, formId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db
    .from("preparation_forms")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", formId);
  if (error) throw new ControlledError(`Falha ao atualizar ficha: ${error.message}`, 502);
}

async function ensureDocument(db: SupabaseClient, form: FormRow, order: OrderContext, caller: CallerInfo | null): Promise<string> {
  if (form.documentPath) return form.documentPath;

  await updateFormRow(db, form.id, { status: "GENERATING_DOCUMENT" });
  const template = await getTemplateById(db, form.templateId);
  const pdfBytes = await generatePreparationFormPdf({
    orderCode: order.code,
    formSequence: form.sequence,
    formCount: order.formCount,
    internalLocation: form.internalLocation,
    formData: form.formData,
    schema: template.schema,
    documentVersion: form.documentVersion,
  });

  const documentPath = `${order.code}/F${pad(form.sequence)}-v${form.documentVersion}.pdf`;
  await uploadDocument(db, documentPath, pdfBytes);
  await updateFormRow(db, form.id, { document_path: documentPath });
  await writeLog(db, { orderId: order.id, formId: form.id, action: "PDF_GENERATED", caller, metadata: { documentPath } });
  return documentPath;
}

// Idempotente (spec seção 12): se já tem auvo_ticket_id, não cria de novo
// — só tenta o anexo de novo se ainda não tiver ido. Cada etapa (PDF →
// ticket → anexo) só roda se a anterior ainda não tiver acontecido, então
// "Tentar novamente" numa ficha com erro retoma de onde parou, nunca do
// zero. Falha de anexo NÃO é fatal (o ticket já existe) — fica registrada
// e a ficha mostra "documento não anexado" em vez de perder o ticket
// criado com sucesso.
export async function sendFormToAuvo(
  db: SupabaseClient,
  form: FormRow,
  order: OrderContext,
  caller: CallerInfo | null
): Promise<FormRow> {
  try {
    const documentPath = await ensureDocument(db, form, order, caller);

    let ticketId = form.auvoTicketId;
    if (!ticketId) {
      await updateFormRow(db, form.id, { status: "CREATING_TICKET" });
      const creds = readAuvoCredentials();
      const result = await createTicket(db, creds, {
        title: `Preparação de máquina - ${order.customerName} - ${form.internalLocation}`,
        description: `Pedido ${order.code} - Ficha ${pad(form.sequence)}/${pad(order.formCount)}`,
        customerId: order.auvoCustomerId,
        requesterName: order.requestedByName ?? caller?.name ?? caller?.email ?? "",
        requesterEmail: order.requestedByEmail ?? caller?.email ?? "",
        externalId: form.externalId,
      });
      ticketId = result.ticketId;
      await updateFormRow(db, form.id, {
        auvo_ticket_id: result.ticketId,
        auvo_ticket_status_id: result.statusId,
        auvo_ticket_status_name: result.statusName,
      });
      await writeLog(db, { orderId: order.id, formId: form.id, action: "AUVO_TICKET_CREATED", caller, metadata: { ticketId } });
    }

    try {
      const creds = readAuvoCredentials();
      const bytes = await downloadDocument(db, documentPath);
      await attachDocument(db, creds, ticketId, `${form.externalId}.pdf`, bytes);
      await writeLog(db, { orderId: order.id, formId: form.id, action: "AUVO_ATTACHMENT_SENT", caller });
    } catch (attachError) {
      const message = attachError instanceof Error ? attachError.message : "Falha desconhecida ao anexar documento.";
      await writeLog(db, { orderId: order.id, formId: form.id, action: "ERROR", caller, metadata: { step: "attach", message } });
      // Segue sem relançar: o ticket já existe, só o anexo falhou — não
      // perde o que já deu certo por causa da parte não confirmada da
      // integração (ver auvoTickets.ts#attachDocument).
    }

    await updateFormRow(db, form.id, {
      status: "SENT_TO_AUVO",
      finalized_by: caller?.id ?? null,
      finalized_at: new Date().toISOString(),
    });
    return { ...form, status: "SENT_TO_AUVO", documentPath, auvoTicketId: ticketId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao enviar ficha pra Auvo.";
    await updateFormRow(db, form.id, { status: "ERROR" });
    await writeLog(db, { orderId: order.id, formId: form.id, action: "ERROR", caller, metadata: { message } });
    return { ...form, status: "ERROR" };
  }
}

// Ficha corrigida depois do ticket já criado (spec seção 15): nova versão
// do documento, tenta reanexar automaticamente no MESMO ticket (nunca
// cria ticket novo); se o anexo falhar, fica registrado e o pedido
// continua mostrando o link de download do v2 pra reanexo manual.
export async function regenerateDocument(
  db: SupabaseClient,
  form: FormRow,
  order: OrderContext,
  caller: CallerInfo | null,
  newFormData?: Record<string, unknown>
): Promise<FormRow> {
  const nextVersion = form.documentVersion + 1;
  if (newFormData) {
    await updateFormRow(db, form.id, { form_data: newFormData, document_version: nextVersion, document_path: null });
  } else {
    await updateFormRow(db, form.id, { document_version: nextVersion, document_path: null });
  }

  const updatedForm: FormRow = { ...form, formData: newFormData ?? form.formData, documentVersion: nextVersion, documentPath: null };
  const documentPath = await ensureDocument(db, updatedForm, order, caller);

  if (updatedForm.auvoTicketId) {
    try {
      const creds = readAuvoCredentials();
      const bytes = await downloadDocument(db, documentPath);
      await attachDocument(db, creds, updatedForm.auvoTicketId, `${form.externalId}-v${nextVersion}.pdf`, bytes);
      await writeLog(db, { orderId: order.id, formId: form.id, action: "AUVO_ATTACHMENT_SENT", caller, metadata: { documentVersion: nextVersion } });
    } catch (attachError) {
      const message = attachError instanceof Error ? attachError.message : "Falha desconhecida ao reanexar documento.";
      await writeLog(db, { orderId: order.id, formId: form.id, action: "ERROR", caller, metadata: { step: "reattach", message } });
    }
  }

  await writeLog(db, {
    orderId: order.id,
    formId: form.id,
    action: "FORM_UPDATED",
    caller,
    metadata: { documentVersion: nextVersion, reason: "regenerate-document" },
  });

  return { ...updatedForm, documentPath };
}
