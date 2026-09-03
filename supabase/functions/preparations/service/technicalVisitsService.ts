import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";
import { CallerInfo } from "../shared/auth.ts";
import { logEvent } from "../shared/logger.ts";
import { readAuvoCredentials } from "../integrations/auvo/auvo.config.ts";
import { createTicket, listRequestTypes, TicketRequestType } from "../integrations/auvo/auvoTickets.ts";

// "Solicitar Visita Técnica" (spec seção 4.1 — segunda opção do "+ Abrir
// chamado", nunca detalhada no resto da spec, que só especifica Pedido de
// Preparação). Pedido explícito do usuário (02/09/2026): ticket simples
// na Auvo, sem ficha/PDF/pedido — só título, descrição, cliente e o tipo
// de solicitação, escolhido pela tela (sem requestTypeId fixo como
// Pedido de Preparação, que é section 9.3 da spec).
export async function getTicketRequestTypes(db: SupabaseClient): Promise<TicketRequestType[]> {
  const creds = readAuvoCredentials();
  return listRequestTypes(db, creds);
}

export interface CreateTechnicalVisitInput {
  customerId: number; // auvo_customers.id interno, mesmo campo do wizard de preparação
  requestTypeId: number;
  title: string;
  description: string;
}

export interface TechnicalVisitResult {
  ticketId: number;
  statusId: number | null;
  statusName: string | null;
}

// Não passa por preparation_orders/preparation_forms (não tem ficha nem
// documento) — auditoria fica em integration_events, mesmo lugar que já
// guarda todo evento técnico de integração Auvo/VMpay neste projeto, sem
// precisar de tabela nova só pra isso.
export async function createTechnicalVisit(
  db: SupabaseClient,
  caller: CallerInfo,
  input: CreateTechnicalVisitInput
): Promise<TechnicalVisitResult> {
  if (!input.title?.trim()) throw new ControlledError("Título do chamado é obrigatório.", 400);
  if (!input.requestTypeId) throw new ControlledError("Tipo de solicitação é obrigatório.", 400);

  const { data: customer, error } = await db
    .from("auvo_customers")
    .select("id, auvo_id")
    .eq("id", input.customerId)
    .maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar cliente: ${error.message}`, 502);
  if (!customer) throw new ControlledError("Cliente não encontrado.", 404);

  const creds = readAuvoCredentials();
  const result = await createTicket(db, creds, {
    title: input.title,
    description: input.description ?? "",
    customerId: customer.auvo_id,
    requestTypeId: input.requestTypeId,
    requesterName: caller.name ?? caller.email ?? "",
    requesterEmail: caller.email ?? "",
  });

  await logEvent(db, "auvo", "AUVO_TECHNICAL_VISIT_TICKET_CREATED", {
    ticketId: result.ticketId,
    customerId: customer.id,
    requestTypeId: input.requestTypeId,
    userId: caller.id,
  });

  return result;
}
