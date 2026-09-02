import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auvoRequest } from "./auvoWriteClient.ts";
import { getValidToken } from "./auvo.tokenManager.ts";
import { AUVO_BASE_URL, AUVO_TICKETS_PATH, AuvoCredentials } from "./auvo.config.ts";
import { ControlledError } from "../../shared/http.ts";

export interface CreateTicketInput {
  title: string;
  description: string;
  customerId: number;
  requesterName: string;
  requesterEmail: string;
  externalId: string; // determinístico: "PREP-2026-000145-F01" (spec 9.4)
}

export interface CreateTicketResult {
  ticketId: number;
  statusId: number | null;
  statusName: string | null;
}

// requestTypeId/statusId fixos pedidos explicitamente na spec (seção 9.3):
// 47652 = "Pedidos de Preparação de máquinas", 97758 = "Aguardando
// atendimento". Se a Auvo reconfigurar esses IDs (fluxo administrativo
// deles, fora deste projeto), atualizar aqui.
const PREPARATION_REQUEST_TYPE_ID = 47652;
const AWAITING_SERVICE_STATUS_ID = 97758;
const DEFAULT_PRIORITY = 1;

// Payload exatamente como veio na spec (seção 9.3) — exemplo já tirado da
// doc real da Auvo pelo autor da spec.
export async function createTicket(db: SupabaseClient, creds: AuvoCredentials, input: CreateTicketInput): Promise<CreateTicketResult> {
  const payload = await auvoRequest(db, creds, AUVO_TICKETS_PATH, {
    method: "POST",
    body: {
      title: input.title,
      description: input.description,
      requestTypeId: PREPARATION_REQUEST_TYPE_ID,
      statusId: AWAITING_SERVICE_STATUS_ID,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      customerId: input.customerId,
      priority: DEFAULT_PRIORITY,
      externalId: input.externalId,
    },
  });
  const result = (payload.result as Record<string, unknown>) ?? payload;
  const id = result.id ?? result.ticketId;
  if (typeof id !== "number") {
    throw new ControlledError("Auvo criou o ticket, mas não devolveu um id reconhecível.", 502);
  }
  return {
    ticketId: id,
    statusId: (result.statusId as number) ?? null,
    statusName: (result.statusName as string) ?? null,
  };
}

// NÃO CONFIRMADO CONTRA A DOC REAL DA AUVO — a spec (seções 2 e 9.5) é
// explícita: o formato do campo de anexo não estava documentado nela, e
// pediu pra não inventar base64/URL sem confirmar. Implementação
// best-effort (multipart/form-data, convenção mais comum de upload de
// arquivo em API REST) isolada NESTA função de propósito: se o formato
// real for outro, é só trocar o corpo daqui, nada mais no módulo depende
// do formato exato. Chamador trata falha aqui como não-fatal (ticket já
// foi criado com sucesso antes desta chamada).
export async function attachDocument(
  db: SupabaseClient,
  creds: AuvoCredentials,
  ticketId: number,
  fileName: string,
  fileBytes: Uint8Array
): Promise<void> {
  const form = new FormData();
  form.append("file", new Blob([fileBytes], { type: "application/pdf" }), fileName);

  // auvoRequest serializa JSON por padrão — chamada solta aqui porque
  // multipart precisa de Content-Type com boundary gerado pelo próprio
  // FormData, incompatível com o "Content-Type: application/json" fixo
  // do client genérico. Ainda passa pelo mesmo token cacheado.
  const token = await getValidToken(db, creds.apiKey, creds.apiToken);

  const res = await fetch(`${AUVO_BASE_URL}${AUVO_TICKETS_PATH}/${ticketId}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ControlledError(`Falha ao anexar documento na Auvo (HTTP ${res.status}): ${body.slice(0, 300)}`, res.status);
  }
}

export interface TicketStatusResult {
  ticketId: number;
  statusId: number | null;
  statusName: string | null;
  taskId: number | null;
  taskStatusName: string | null;
  assigneeName: string | null;
}

// Best-effort também (menos arriscado que o anexo — GET é seguro de
// iterar): monta a consulta exatamente como a spec pede na seção 14
// (searchTasks + searchStatusChanges), mas o shape do JSON de resposta
// (onde exatamente vem status.name / tarefa vinculada / responsável)
// ainda não foi confirmado contra uma resposta real. Ajustar os
// caminhos de leitura abaixo assim que houver um exemplo de resposta.
export async function syncTicketStatus(db: SupabaseClient, creds: AuvoCredentials, ticketId: number): Promise<TicketStatusResult> {
  const query = new URLSearchParams({ searchTasks: "true", searchStatusChanges: "true" });
  const payload = await auvoRequest(db, creds, `${AUVO_TICKETS_PATH}/${ticketId}?${query.toString()}`);
  const result = (payload.result as Record<string, unknown>) ?? payload;
  const task = (result.tasks as Record<string, unknown>[] | undefined)?.[0];

  return {
    ticketId,
    statusId: (result.statusId as number) ?? null,
    statusName: (result.statusName as string) ?? ((result.status as Record<string, unknown>)?.name as string) ?? null,
    taskId: (task?.id as number) ?? null,
    taskStatusName: (task?.statusName as string) ?? null,
    assigneeName: (task?.assigneeName as string) ?? (task?.responsibleName as string) ?? null,
  };
}
