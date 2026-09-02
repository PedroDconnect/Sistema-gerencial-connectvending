import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse, ControlledError } from "../shared/http.ts";
import { getSignedDocumentUrl } from "../service/storageService.ts";

// "Ver ficha" (spec 13.2) — bucket é privado, então nunca existe uma URL
// fixa gravada em document_path direto; gera uma signed URL de curta
// duração a cada pedido.
export async function handleGetFormDocument(db: SupabaseClient, orderId: string, formId: string): Promise<Response> {
  const { data, error } = await db
    .from("preparation_forms")
    .select("document_path")
    .eq("id", formId)
    .eq("preparation_order_id", orderId)
    .maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar documento: ${error.message}`, 502);
  if (!data?.document_path) throw new ControlledError("Documento ainda não foi gerado pra esta ficha.", 404);

  const url = await getSignedDocumentUrl(db, data.document_path as string);
  return jsonResponse({ url });
}
