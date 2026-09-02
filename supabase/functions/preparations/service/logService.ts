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

export interface FormLastError {
  step: string | null;
  message: string;
  createdAt: string;
}

// Pedido explícito do usuário (02/09/2026): a tela de detalhe mostrava só
// o badge "Erro" sem dizer por quê, obrigando a consultar preparation_logs
// direto no banco pra descobrir. Isso resolve isso — devolve o ERROR mais
// recente de cada ficha do pedido, pronto pra exibir na UI. 1 query pro
// pedido inteiro (não 1 por ficha): busca todo ERROR do pedido de uma vez
// e reduz em memória, já que o volume por pedido é sempre pequeno
// (algumas fichas, não milhares de linhas).
export async function getLastErrorsByForm(db: SupabaseClient, orderId: string): Promise<Map<string, FormLastError>> {
  const { data, error } = await db
    .from("preparation_logs")
    .select("preparation_form_id, metadata, created_at")
    .eq("preparation_order_id", orderId)
    .eq("action", "ERROR")
    .not("preparation_form_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) return new Map(); // não bloqueia a tela de detalhe por causa disso

  const byForm = new Map<string, FormLastError>();
  for (const row of data ?? []) {
    const formId = row.preparation_form_id as string;
    if (byForm.has(formId)) continue; // já pegou o mais recente (ordenado desc)
    const metadata = (row.metadata as Record<string, unknown>) ?? {};
    byForm.set(formId, {
      step: typeof metadata.step === "string" ? metadata.step : null,
      message: typeof metadata.message === "string" ? metadata.message : "Falha desconhecida.",
      createdAt: row.created_at as string,
    });
  }
  return byForm;
}
