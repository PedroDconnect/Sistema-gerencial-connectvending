import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { IntegrationProvider, ProviderHealth, Task, TaskFilters, TaskListParams, TaskPage } from "../types.ts";
import { normalizeAuvoTask } from "./auvo.normalizer.ts";
import { listTasksRaw, countTasksRaw, getTaskByIdRaw, AuvoParamFilter, AuvoCredentials } from "./auvo.client.ts";
import { ControlledError } from "../../shared/http.ts";

export function readCredentials(): AuvoCredentials {
  const apiKey = Deno.env.get("AUVO_API_KEY");
  const apiToken = Deno.env.get("AUVO_API_TOKEN");
  if (!apiKey || !apiToken) {
    throw new ControlledError("Integração com a Auvo não está configurada.", 500);
  }
  return { apiKey, apiToken };
}

function buildParamFilter(filters: TaskFilters): AuvoParamFilter {
  const paramFilter: AuvoParamFilter = {};

  if (filters.customerId) {
    // Confirmado: quando customerId é informado, startDate/endDate deixam
    // de ser obrigatórios na Auvo — mas ainda os enviamos quando existem,
    // para não perder o filtro de período junto com o de cliente.
    paramFilter.customerId = filters.customerId;
  }

  if (filters.dateFrom) paramFilter.startDate = `${filters.dateFrom}T00:00:00`;
  if (filters.dateTo) paramFilter.endDate = `${filters.dateTo}T23:59:59`;
  if (filters.technicianId) paramFilter.idUserTo = filters.technicianId;
  if (filters.taskTypeId) paramFilter.type = filters.taskTypeId;

  // filters.status é IGNORADO de propósito aqui — confirmado empiricamente
  // que o filtro "status" da Auvo não é confiável (para vários valores ela
  // devolve tarefas de status diferente do pedido, ou 404/500 quando o
  // resultado seria zero). Quem precisa filtrar por status faz isso no
  // OperationService, sobre tarefas reais já buscadas.

  return paramFilter;
}

export function createAuvoProvider(db: SupabaseClient): IntegrationProvider {
  return {
    name: "auvo",

    async countTasks(filters: TaskFilters): Promise<number> {
      const creds = readCredentials();
      return countTasksRaw(db, creds, buildParamFilter(filters));
    },

    async listTasks(params: TaskListParams): Promise<TaskPage> {
      const creds = readCredentials();
      const { entityList, totalItems } = await listTasksRaw(db, creds, {
        paramFilter: buildParamFilter(params),
        page: params.page,
        pageSize: params.pageSize,
      });

      return {
        items: entityList.map(normalizeAuvoTask),
        total: totalItems,
        page: params.page,
        pageSize: params.pageSize,
      };
    },

    async getTask(id: number): Promise<Task | null> {
      const creds = readCredentials();
      const raw = await getTaskByIdRaw(db, creds, id);
      return raw ? normalizeAuvoTask(raw) : null;
    },

    async health(): Promise<ProviderHealth> {
      const { data } = await db
        .from("integration_tokens")
        .select("last_success_at, last_error, last_error_at, expires_at")
        .eq("provider", "auvo")
        .maybeSingle();

      const online = Boolean(data?.expires_at && new Date(data.expires_at).getTime() > Date.now());

      return {
        provider: "auvo",
        online,
        lastSuccessAt: data?.last_success_at ?? null,
        lastError: data?.last_error ?? null,
        lastErrorAt: data?.last_error_at ?? null,
      };
    },
  };
}
