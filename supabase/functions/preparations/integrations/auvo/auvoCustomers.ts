import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auvoRequest } from "./auvoWriteClient.ts";
import { AUVO_CUSTOMERS_PATH, AuvoCredentials } from "./auvo.config.ts";

export interface CreateAuvoCustomerInput {
  externalId: string;
  name: string;
  cpfCnpj: string;
  phoneNumber?: string[];
  email?: string[];
  address?: string;
  legalName?: string;
}

export interface AuvoCustomerResult {
  auvoId: number;
  description: string | null;
  cpfCnpj: string | null;
}

function toResult(raw: Record<string, unknown>): AuvoCustomerResult {
  return {
    auvoId: raw.id as number,
    description: (raw.description as string) ?? null,
    cpfCnpj: (raw.cpfCnpj as string) ?? null,
  };
}

// Busca por CNPJ/CPF antes de criar (risco de corrida da spec seção 2 —
// mitigação de melhor esforço, não elimina a janela por completo sem
// upsert nativo confirmado na doc da Auvo). Mesmo formato de paramFilter
// já confirmado empiricamente em operation/integrations/auvo/auvo.client.ts
// pra listagem de tarefas — aqui aplicado ao endpoint de customers.
export async function findAuvoCustomerByCnpj(
  db: SupabaseClient,
  creds: AuvoCredentials,
  cpfCnpj: string
): Promise<AuvoCustomerResult | null> {
  const query = new URLSearchParams({
    paramFilter: JSON.stringify({ cpfCnpj }),
    page: "1",
    pageSize: "1",
  });
  const payload = await auvoRequest(db, creds, `${AUVO_CUSTOMERS_PATH}?${query.toString()}`);
  const result = payload.result as Record<string, unknown> | undefined;
  const entityList = (result?.entityList as Record<string, unknown>[]) ?? [];
  return entityList.length > 0 ? toResult(entityList[0]) : null;
}

// Payload exatamente como veio na spec (seção 9.2) — já é um exemplo
// tirado da doc real da Auvo pelo autor da spec, não uma suposição minha.
export async function createAuvoCustomer(
  db: SupabaseClient,
  creds: AuvoCredentials,
  input: CreateAuvoCustomerInput
): Promise<AuvoCustomerResult> {
  const payload = await auvoRequest(db, creds, AUVO_CUSTOMERS_PATH, {
    method: "POST",
    body: {
      externalId: input.externalId,
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      phoneNumber: input.phoneNumber ?? [],
      email: input.email ?? [],
      address: input.address ?? "",
      active: true,
      legalName: input.legalName ?? input.name,
    },
  });
  const result = (payload.result as Record<string, unknown>) ?? payload;
  return toResult(result);
}

// Busca-então-cria, tratando "CNPJ já existe" (resposta de erro da Auvo
// pra CNPJ duplicado) como sucesso — busca de novo e usa o resultado, em
// vez de propagar erro. Reduz a janela de corrida sem depender de upsert
// nativo (não confirmado se a Auvo oferece isso — ver risco na spec).
export async function findOrCreateAuvoCustomer(
  db: SupabaseClient,
  creds: AuvoCredentials,
  input: CreateAuvoCustomerInput
): Promise<AuvoCustomerResult> {
  const existing = await findAuvoCustomerByCnpj(db, creds, input.cpfCnpj);
  if (existing) return existing;

  try {
    return await createAuvoCustomer(db, creds, input);
  } catch (error) {
    // Mensagem de duplicidade não está documentada com exatidão — checagem
    // best-effort por substring, revisitar se a Auvo devolver outro texto.
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("cnpj") || message.includes("cpf") || message.includes("já existe") || message.includes("duplicad")) {
      const retried = await findAuvoCustomerByCnpj(db, creds, input.cpfCnpj);
      if (retried) return retried;
    }
    throw error;
  }
}
