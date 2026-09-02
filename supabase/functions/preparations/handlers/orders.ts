import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse, ControlledError } from "../shared/http.ts";
import { CallerInfo } from "../shared/auth.ts";
import { listOrders, getOrderDetail, createOrder, retryForm, regenerateFormDocument, syncOrderWithAuvo } from "../service/ordersService.ts";

function parsePagination(url: URL): { page: number; pageSize: number } {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  return { page, pageSize };
}

export async function handleListOrders(db: SupabaseClient, url: URL): Promise<Response> {
  const { page, pageSize } = parsePagination(url);
  return jsonResponse(await listOrders(db, page, pageSize));
}

export async function handleGetOrder(db: SupabaseClient, orderId: string): Promise<Response> {
  return jsonResponse(await getOrderDetail(db, orderId));
}

export async function handleCreateOrder(db: SupabaseClient, caller: CallerInfo, req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new ControlledError("Corpo da requisição inválido.", 400);
  const result = await createOrder(db, caller, body);
  return jsonResponse(result, 201);
}

export async function handleRetryForm(db: SupabaseClient, caller: CallerInfo, orderId: string, formId: string): Promise<Response> {
  return jsonResponse(await retryForm(db, orderId, formId, caller));
}

export async function handleRegenerateDocument(db: SupabaseClient, caller: CallerInfo, orderId: string, formId: string, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const newFormData = body && typeof body === "object" && body.formData && typeof body.formData === "object" ? body.formData : undefined;
  return jsonResponse(await regenerateFormDocument(db, orderId, formId, caller, newFormData));
}

export async function handleSyncOrder(db: SupabaseClient, caller: CallerInfo, orderId: string): Promise<Response> {
  return jsonResponse(await syncOrderWithAuvo(db, orderId, caller));
}
