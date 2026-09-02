import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";

// Primeiro uso de Supabase Storage neste projeto — bucket privado
// "preparation-documents" (criado em schema.sql via insert direto em
// storage.buckets). Só a service role toca esses arquivos (sem policy em
// storage.objects, mesma convenção do resto do banco) — "nunca depender
// exclusivamente do arquivo que está na Auvo" (spec seção 10).
const BUCKET = "preparation-documents";

export async function uploadDocument(db: SupabaseClient, path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new ControlledError(`Falha ao salvar o documento: ${error.message}`, 502);
}

export async function downloadDocument(db: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error) throw new ControlledError(`Falha ao ler o documento: ${error.message}`, 502);
  return new Uint8Array(await data.arrayBuffer());
}

// URL de curta duração — o bucket é privado, então nunca existe uma URL
// pública fixa pro documento; o frontend pede uma nova toda vez que
// alguém clica em "Ver ficha".
export async function getSignedDocumentUrl(db: SupabaseClient, path: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw new ControlledError(`Falha ao gerar link do documento: ${error.message}`, 502);
  return data.signedUrl;
}
