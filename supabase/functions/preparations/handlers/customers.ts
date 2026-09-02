import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse, ControlledError } from "../shared/http.ts";
import { searchCustomers, findOrCreateCustomer } from "../service/customersService.ts";

export async function handleSearchCustomers(db: SupabaseClient, url: URL): Promise<Response> {
  const q = url.searchParams.get("q") ?? "";
  return jsonResponse({ items: await searchCustomers(db, q) });
}

export async function handleCreateCustomer(db: SupabaseClient, req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.cpfCnpj) {
    throw new ControlledError("Nome e CNPJ/CPF são obrigatórios pra criar o cliente.", 400);
  }
  const result = await findOrCreateCustomer(db, body);
  return jsonResponse(result, 201);
}
