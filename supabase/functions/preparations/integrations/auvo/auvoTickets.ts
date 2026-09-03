import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auvoRequest } from "./auvoWriteClient.ts";
import { AUVO_TICKETS_PATH, AuvoCredentials } from "./auvo.config.ts";
import { ControlledError } from "../../shared/http.ts";

// Confirmado contra a doc real da Auvo (OpenAPI, 02/09/2026): "Chamados"
// só tem GET /tickets/{id}, PATCH /tickets/{id}, POST /tickets, GET
// /tickets, GET /tickets/request-type — NÃO existe PUT /tickets/{id}/attachments
// (diferente de Produtos/Equipamentos/Tarefas/Despesas, que têm esse
// endpoint dedicado). O anexo é um campo ("attachments", "Array of any")
// dentro do próprio corpo de POST /tickets — vai junto na criação, não
// depois. Por isso attachDocument (chamada separada pra um endpoint que
// não existe) foi removida; o PDF agora entra direto em createTicket.
export interface TicketAttachment {
  fileName: string;
  bytes: Uint8Array;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  customerId: number;
  requesterName: string;
  requesterEmail: string;
  externalId: string; // determinístico: "PREP-2026-000145-F01" (spec 9.4)
  attachment?: TicketAttachment;
}

export interface CreateTicketResult {
  ticketId: number;
  statusId: number | null;
  statusName: string | null;
}

// requestTypeId/statusId fixos pedidos explicitamente na spec (seção 9.3):
// 47652 = "Pedidos de Preparação de máquinas", 97758 = "Aguardando
// atendimento". Se a Auvo reconfigurar esses IDs (fluxo administrativo
// deles, fora deste projeto) e a criação de ticket passar a falhar por
// "tipo/status inválido", confirmar os valores reais em
// GET /tickets/request-type e GET /tickets/status.
const PREPARATION_REQUEST_TYPE_ID = 47652;
const AWAITING_SERVICE_STATUS_ID = 97758;
const DEFAULT_PRIORITY = 1;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Shape de cada item de "attachments" — ajustado aos poucos pelo erro de
// validação real da Auvo (a doc só dizia "Array of any"): "The attachment
// name is required" confirmou que o campo se chama "name", não
// "fileName" (02/09/2026). base64Content ainda não teve erro próprio —
// se a Auvo reclamar de novo, é só ajustar aqui, nada mais no módulo
// depende do formato exato.
function toAttachmentPayload(attachment: TicketAttachment): Record<string, unknown> {
  return {
    name: attachment.fileName,
    base64Content: toBase64(attachment.bytes),
  };
}

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
      ...(input.attachment ? { attachments: [toAttachmentPayload(input.attachment)] } : {}),
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

// Ficha corrigida (v2) depois que o ticket já existe (spec seção 15): a
// doc só documenta externalId/statusId como campos editáveis de
// PATCH /tickets/{id} — "attachments" não aparece lá. Não há nenhum outro
// endpoint pra anexar depois da criação (ver nota no topo do arquivo), só
// resta tentar o mesmo campo via PATCH na esperança de que a doc resumida
// não seja exaustiva. Best-effort de verdade — chamador trata falha como
// não-fatal e mantém o link de download do v2 pra reanexo manual.
export async function tryReattachDocument(
  db: SupabaseClient,
  creds: AuvoCredentials,
  ticketId: number,
  attachment: TicketAttachment
): Promise<void> {
  await auvoRequest(db, creds, `${AUVO_TICKETS_PATH}/${ticketId}`, {
    method: "PATCH",
    body: { attachments: [toAttachmentPayload(attachment)] },
  });
}

export interface TicketStatusResult {
  ticketId: number;
  statusId: number | null;
  statusName: string | null;
  taskId: number | null;
  taskStatusName: string | null;
  assigneeName: string | null;
}

// Corrigido contra a doc real: searchTasks/searchStatusChanges são
// parâmetros da LISTAGEM (GET /tickets?paramFilter=...), não de
// GET /tickets/{id} (que não documenta query params nenhum). Filtra por
// id via paramFilter.ids (mesmo formato de filtro comma-separated já
// confirmado nos outros recursos da API).
export async function syncTicketStatus(db: SupabaseClient, creds: AuvoCredentials, ticketId: number): Promise<TicketStatusResult> {
  const query = new URLSearchParams({
    paramFilter: JSON.stringify({ ids: String(ticketId) }),
    searchTasks: "true",
    searchStatusChanges: "true",
    page: "1",
    pageSize: "1",
  });
  const payload = await auvoRequest(db, creds, `${AUVO_TICKETS_PATH}?${query.toString()}`);
  const listResult = payload.result as Record<string, unknown> | undefined;
  const result = ((listResult?.entityList as Record<string, unknown>[]) ?? [])[0] ?? {};
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
