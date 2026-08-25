import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshAssetsSnapshot } from "../service/assetsSyncService.ts";
import { listAssets, getAssetDetail, getAssetFilterOptions } from "../service/assetsQueryService.ts";
import { parseAssetsListFilters, parseAssetsPagination } from "../service/assetsFilters.ts";
import { jsonResponse, ControlledError } from "../shared/http.ts";

export async function handleAssetsList(db: SupabaseClient, url: URL): Promise<Response> {
  await ensureFreshAssetsSnapshot(db);
  const filters = parseAssetsListFilters(url.searchParams);
  const { page, pageSize } = parseAssetsPagination(url.searchParams);
  const result = await listAssets(db, filters, page, pageSize);
  return jsonResponse(result);
}

export async function handleAssetFilterOptions(db: SupabaseClient): Promise<Response> {
  await ensureFreshAssetsSnapshot(db);
  const options = await getAssetFilterOptions(db);
  return jsonResponse(options);
}

export async function handleAssetDetail(db: SupabaseClient, auvoIdRaw: string): Promise<Response> {
  const auvoId = Number(auvoIdRaw);
  if (!Number.isFinite(auvoId)) throw new ControlledError("ID de equipamento inválido.", 400);

  await ensureFreshAssetsSnapshot(db);
  const asset = await getAssetDetail(db, auvoId);
  if (!asset) throw new ControlledError("Equipamento não encontrado.", 404);
  return jsonResponse(asset);
}
