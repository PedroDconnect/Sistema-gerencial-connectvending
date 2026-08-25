import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshAssetsSnapshot } from "../service/assetsSyncService.ts";
import { listCustomers, getCustomerDetail } from "../service/assetsQueryService.ts";
import { parseCustomersListFilters, parseAssetsPagination } from "../service/assetsFilters.ts";
import { jsonResponse, ControlledError } from "../shared/http.ts";

export async function handleCustomersList(db: SupabaseClient, url: URL): Promise<Response> {
  await ensureFreshAssetsSnapshot(db);
  const filters = parseCustomersListFilters(url.searchParams);
  const { page, pageSize } = parseAssetsPagination(url.searchParams);
  const result = await listCustomers(db, filters, page, pageSize);
  return jsonResponse(result);
}

export async function handleCustomerDetail(db: SupabaseClient, auvoIdRaw: string): Promise<Response> {
  const auvoId = Number(auvoIdRaw);
  if (!Number.isFinite(auvoId)) throw new ControlledError("ID de cliente inválido.", 400);

  await ensureFreshAssetsSnapshot(db);
  const customer = await getCustomerDetail(db, auvoId);
  if (!customer) throw new ControlledError("Cliente não encontrado.", 404);
  return jsonResponse(customer);
}
