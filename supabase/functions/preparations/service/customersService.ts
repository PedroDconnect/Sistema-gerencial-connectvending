import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readAuvoCredentials } from "../integrations/auvo/auvo.config.ts";
import { findOrCreateAuvoCustomer } from "../integrations/auvo/auvoCustomers.ts";
import { ControlledError } from "../shared/http.ts";

export interface PreparationCustomerRow {
  id: number; // auvo_customers.id (PK interna, é o que preparation_orders.customer_id referencia)
  auvoId: number;
  name: string | null;
  legalName: string | null;
  cpfCnpj: string | null;
  address: string | null;
}

function toCustomerRow(row: Record<string, unknown>): PreparationCustomerRow {
  return {
    id: row.id as number,
    auvoId: row.auvo_id as number,
    name: (row.description as string) ?? null,
    legalName: (row.legal_name as string) ?? null,
    cpfCnpj: (row.cpf_cnpj as string) ?? null,
    address: (row.address as string) ?? null,
  };
}

// Busca no cache já sincronizado (auvo_customers), não ao vivo na Auvo por
// keystroke — mesmo modelo de listCustomers em
// operation/service/assetsQueryService.ts (ilike sobre description/
// cpf_cnpj, mesma sanitização contra injeção de filtro PostgREST).
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, " ").trim();
}

export async function searchCustomers(db: SupabaseClient, search: string): Promise<PreparationCustomerRow[]> {
  let query = db.from("auvo_customers").select("id, auvo_id, description, legal_name, cpf_cnpj, address").eq("active", true);

  const term = sanitizeSearchTerm(search);
  if (term) {
    query = query.or(`description.ilike.%${term}%,cpf_cnpj.ilike.%${term}%`);
  }

  const { data, error } = await query.order("description", { ascending: true }).limit(20);
  if (error) throw new ControlledError(`Falha ao buscar clientes: ${error.message}`, 502);
  return (data ?? []).map(toCustomerRow);
}

export interface CreateCustomerInput {
  name: string;
  cpfCnpj: string;
  legalName?: string;
  address?: string;
  email?: string;
  phoneNumber?: string;
}

// Cria (ou reaproveita, se já existir por CNPJ) o cliente na Auvo, e
// espelha o resultado em auvo_customers na hora — sem isso, o cliente só
// apareceria localmente na próxima sincronização de Ativos/Operação
// Completa (module "operation", TTL de 30min ou botão manual), e
// preparation_orders.customer_id não teria pra onde apontar imediatamente
// (é uma FK de verdade pra auvo_customers.id).
export async function findOrCreateCustomer(db: SupabaseClient, input: CreateCustomerInput): Promise<PreparationCustomerRow> {
  const creds = readAuvoCredentials();
  const auvoResult = await findOrCreateAuvoCustomer(db, creds, {
    externalId: `CEO-CUST-${input.cpfCnpj.replace(/\D/g, "")}`,
    name: input.name,
    cpfCnpj: input.cpfCnpj,
    legalName: input.legalName,
    address: input.address,
    email: input.email ? [input.email] : [],
    phoneNumber: input.phoneNumber ? [input.phoneNumber] : [],
  });

  const { data, error } = await db
    .from("auvo_customers")
    .upsert(
      {
        auvo_id: auvoResult.auvoId,
        description: auvoResult.description ?? input.name,
        legal_name: input.legalName ?? null,
        cpf_cnpj: auvoResult.cpfCnpj ?? input.cpfCnpj,
        address: input.address ?? null,
        active: true,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "auvo_id" }
    )
    .select("id, auvo_id, description, legal_name, cpf_cnpj, address")
    .single();

  if (error) throw new ControlledError(`Cliente criado na Auvo, mas falhou ao salvar localmente: ${error.message}`, 502);
  return toCustomerRow(data);
}
