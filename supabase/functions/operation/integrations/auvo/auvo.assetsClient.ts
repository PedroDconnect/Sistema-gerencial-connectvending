import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requestJson, AuvoCredentials } from "./auvo.client.ts";
import { AUVO_CUSTOMERS_PATH, AUVO_EQUIPMENTS_PATH, AUVO_MAX_PAGE_SIZE } from "./auvo.config.ts";

interface AuvoAssetsPage {
  entityList: Record<string, unknown>[];
  totalItems: number;
}

// Mesmo envelope de /tasks (result.entityList + result.pagedSearchReturnData.totalItems),
// confirmado ao vivo contra /customers e /equipments — paramFilter vazio
// porque a sincronização busca sempre a base inteira, sem filtro de data
// (diferente de tasks, que é sempre uma janela).
async function listPageRaw(
  db: SupabaseClient,
  creds: AuvoCredentials,
  path: string,
  page: number,
  pageSize: number
): Promise<AuvoAssetsPage> {
  const query = new URLSearchParams({
    paramFilter: JSON.stringify({}),
    page: String(page),
    pageSize: String(Math.min(pageSize, AUVO_MAX_PAGE_SIZE)),
    order: "Asc",
  });

  const payload = await requestJson(db, creds, `${path}?${query.toString()}`);
  const result = payload.result as Record<string, unknown> | undefined;
  const paged = result?.pagedSearchReturnData as Record<string, unknown> | undefined;

  return {
    entityList: (result?.entityList as Record<string, unknown>[]) ?? [],
    totalItems: typeof paged?.totalItems === "number" ? paged.totalItems : 0,
  };
}

export function listCustomersPageRaw(
  db: SupabaseClient,
  creds: AuvoCredentials,
  page: number,
  pageSize: number
): Promise<AuvoAssetsPage> {
  return listPageRaw(db, creds, AUVO_CUSTOMERS_PATH, page, pageSize);
}

export function listEquipmentsPageRaw(
  db: SupabaseClient,
  creds: AuvoCredentials,
  page: number,
  pageSize: number
): Promise<AuvoAssetsPage> {
  return listPageRaw(db, creds, AUVO_EQUIPMENTS_PATH, page, pageSize);
}
