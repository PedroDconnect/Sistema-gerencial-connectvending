import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CallerInfo } from "../shared/auth.ts";

// Ações válidas (spec seção 16) — só documentativo aqui (a coluna é text
// livre no banco, sem check constraint, pra nunca travar um log por causa
// de um valor novo que o time queira registrar depois).
export type PreparationLogAction =
  | "ORDER_CREATED"
  | "FORM_CREATED"
  | "FORM_UPDATED"
  | "FORM_FINALIZED"
  | "PDF_GENERATED"
  | "AUVO_TICKET_CREATED"
  | "AUVO_ATTACHMENT_SENT"
  | "AUVO_STATUS_UPDATED"
  | "AUVO_TASK_FOUND"
  | "ERROR";

// Nunca lança — auditoria não pode derrubar o fluxo principal (mesmo
// princípio de logEvent em shared/logger.ts). metadata nunca deve conter
// token/credencial (spec seção 16) — quem chama é responsável por não
// passar isso; aqui não há redaction automática porque o conteúdo
// esperado (respostas de erro da Auvo, ids, nomes) é sempre não-sensível
// por natureza, diferente de shared/logger.ts (que loga payload técnico
// bruto da integração).
export async function writeLog(
  db: SupabaseClient,
  params: {
    orderId: string;
    formId?: string | null;
    action: PreparationLogAction;
    caller?: CallerInfo | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.from("preparation_logs").insert({
      preparation_order_id: params.orderId,
      preparation_form_id: params.formId ?? null,
      action: params.action,
      user_id: params.caller?.id ?? null,
      user_name: params.caller?.name ?? params.caller?.email ?? null,
      user_email: params.caller?.email ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // intencional: log nunca deve quebrar o fluxo principal
  }
}
