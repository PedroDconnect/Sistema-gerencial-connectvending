import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuvoProvider } from "../integrations/auvo/auvo.provider.ts";
import { todayBrazil, addDays } from "./filters.ts";
import { AUVO_CONCURRENCY_LIMIT, getAuvoTasksSyncTtlSeconds, getAuvoTasksSyncTimeBudgetMs } from "../integrations/auvo/auvo.config.ts";
import { logEvent } from "../shared/logger.ts";
import { IntegrationProvider, Task } from "../integrations/types.ts";
import { ControlledError } from "../shared/http.ts";

// Pedido explicitamente pelo usuário (19/08/2026) pro painel gerencial por
// cliente. 3 destes nomes ("Chamado Telemetria", "Retorno Técnico",
// "Retorno Técnico de peça") não apareceram nas amostras reais consultadas
// antes de implementar — mantidos exatamente como o usuário escreveu; se a
// grafia real da Auvo divergir, esse tipo só aparece com 0 chamados.
export const CUSTOMER_PANEL_TASK_TYPES = [
  "Abastecimento - Chamado",
  "Chamado Telemetria",
  "Chamado logística",
  "Chamado Técnico corretivo",
  "Retorno Técnico",
  "Retorno Técnico de peça",
];

const CACHE_KEY = "auvo_tasks_sync";
const CLAIM_TTL_SECONDS = 180;
const TASK_PAGE_SIZE = 100;
// Tarefa tem payload bem mais pesado por página que venda VMpay
// (questionários, fotos, produtos — ver comentário em operationService.ts)
// — teto de segurança menor que o das outras sincronizações.
const MAX_PAGES_PER_DAY = 60;

const RECENT_WINDOW_DAYS = 7; // bate com o default do painel gerencial
const BACKFILL_FLOOR_DAYS = 40;

export interface AuvoTasksSyncMeta {
  status: "ok" | "partial" | "error" | null;
  cursorDate: string | null; // próximo dia a processar (nunca null depois do 1º run)
  backfillComplete: boolean;
  lastRecentCycleAt: string | null; // última vez que os últimos 7 dias foram 100% revisitados
  lastRunAt: string | null;
  taskCount: number;
  daysProcessed: number;
  error: string | null;
}

const EMPTY_META: AuvoTasksSyncMeta = {
  status: null,
  cursorDate: null,
  backfillComplete: false,
  lastRecentCycleAt: null,
  lastRunAt: null,
  taskCount: 0,
  daysProcessed: 0,
  error: null,
};

interface CacheRow {
  generated_at: string | null;
  payload: AuvoTasksSyncMeta | null;
}

async function readCacheRow(db: SupabaseClient): Promise<CacheRow | null> {
  const { data } = await db.from("operational_snapshot_cache").select("generated_at, payload").eq("cache_key", CACHE_KEY).maybeSingle();
  return data ?? null;
}

function remainingMs(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now());
}

async function withDeadline<T>(deadlineAt: number, fn: () => Promise<T>): Promise<T | null> {
  const budget = remainingMs(deadlineAt);
  if (budget <= 0) return null;
  return Promise.race([fn(), new Promise<null>((resolve) => setTimeout(() => resolve(null), budget))]);
}

// Busca TODAS as tarefas (todos os tipos, sistema inteiro) de UM dia só —
// a Auvo não filtra por tipo de forma confiável (mesmo motivo de "status"
// já documentado), então filtra por nome depois de buscar. Um dia por vez
// mantém o volume por chamada previsível (~1.000-1.500 tarefas, 10-15
// páginas) em vez de um período grande de uma vez.
// A Auvo devolve HTTP 404 (não um array vazio) quando o filtro não tem
// NENHUMA tarefa correspondente — confirmado empiricamente e já
// documentado em auvo.client.ts. Sem esse tratamento, um dia realmente
// vazio (fim de semana, por exemplo — confirmado ao vivo: 16/08/2026,
// domingo) virava "incompleto" pra sempre, retentando o mesmo dia sem
// nunca avançar o cursor. 404 aqui é "zero de verdade", não falha.
async function countDayTasks(provider: IntegrationProvider, filters: { dateFrom: string; dateTo: string }): Promise<number> {
  try {
    return await provider.countTasks(filters);
  } catch (error) {
    if (error instanceof ControlledError && error.status === 404) return 0;
    throw error;
  }
}

async function fetchDayTasks(provider: IntegrationProvider, day: string, deadlineAt: number): Promise<{ tasks: Task[]; incomplete: boolean }> {
  const filters = { dateFrom: day, dateTo: day };
  const total = await withDeadline(deadlineAt, () => countDayTasks(provider, filters).catch(() => -1));
  if (total === null || total === -1) return { tasks: [], incomplete: true };
  if (total === 0) return { tasks: [], incomplete: false };

  const pages = Math.min(Math.ceil(total / TASK_PAGE_SIZE), MAX_PAGES_PER_DAY);
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
  const allTasks: Task[] = [];
  let incomplete = total > pages * TASK_PAGE_SIZE;
  let cursor = 0;

  async function worker() {
    while (cursor < pageNumbers.length) {
      if (remainingMs(deadlineAt) <= 0) {
        incomplete = true;
        return;
      }
      const page = pageNumbers[cursor++];
      const result = await withDeadline(deadlineAt, () => provider.listTasks({ ...filters, page, pageSize: TASK_PAGE_SIZE }).catch(() => null));
      if (result) allTasks.push(...result.items);
      else incomplete = true;
    }
  }

  const workerCount = Math.min(Math.max(AUVO_CONCURRENCY_LIMIT, 1), pages || 1);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return { tasks: allTasks, incomplete };
}

async function upsertTasks(db: SupabaseClient, tasks: Task[]): Promise<void> {
  const relevant = tasks.filter((t) => CUSTOMER_PANEL_TASK_TYPES.includes(t.taskTypeName));
  if (relevant.length === 0) return;

  const rows = relevant.map((t) => ({
    auvo_task_id: t.id,
    customer_id: t.customerId,
    task_type_name: t.taskTypeName,
    technician_name: t.technicianName || null,
    creation_date: t.creationDate,
    task_date: t.taskDate,
    status: t.status,
    finished: t.finished,
    check_out_date: t.checkOutDate,
    task_url: t.taskUrl,
  }));

  // upsert de verdade (não ignoreDuplicates): status/finished mudam depois
  // que a tarefa é criada (aberta → finalizada), diferente de uma venda,
  // que é um evento imutável — precisa sobrescrever, não só ignorar.
  const { error } = await db.from("auvo_tasks_cache").upsert(rows, { onConflict: "auvo_task_id" });
  if (error) throw new Error(`Falha ao salvar auvo_tasks_cache: ${error.message}`);
}

async function runTasksSync(db: SupabaseClient): Promise<AuvoTasksSyncMeta> {
  const provider = createAuvoProvider(db);
  const cached = await readCacheRow(db);
  const previous = cached?.payload ?? EMPTY_META;
  const deadlineAt = Date.now() + getAuvoTasksSyncTimeBudgetMs();

  const today = todayBrazil();
  const backfillFloor = addDays(today, -BACKFILL_FLOOR_DAYS);
  const recentFloor = addDays(today, -(RECENT_WINDOW_DAYS - 1));
  const ttlMs = getAuvoTasksSyncTtlSeconds() * 1000;

  let backfillComplete = previous.backfillComplete;
  let lastRecentCycleAt = previous.lastRecentCycleAt;
  let cursorDate = previous.cursorDate ?? today;

  let taskCount = 0;
  let daysProcessed = 0;
  let ranOutOfBudget = false;

  if (!backfillComplete) {
    // Fase 1 — backfill: anda pra trás de today até backfillFloor, um dia
    // por vez, retomando de cursorDate se a chamada anterior ficou parcial.
    let day = cursorDate;
    while (day >= backfillFloor) {
      if (remainingMs(deadlineAt) <= 0) {
        ranOutOfBudget = true;
        break;
      }
      const { tasks, incomplete } = await fetchDayTasks(provider, day, deadlineAt);
      await upsertTasks(db, tasks);
      taskCount += tasks.filter((t) => CUSTOMER_PANEL_TASK_TYPES.includes(t.taskTypeName)).length;
      daysProcessed += 1;
      if (incomplete) {
        ranOutOfBudget = true;
        break;
      }
      day = addDays(day, -1);
    }

    if (!ranOutOfBudget && day < backfillFloor) {
      backfillComplete = true;
      cursorDate = today;
    } else {
      cursorDate = day;
    }
  } else {
    // Fase 2 — ciclo recente: só os últimos RECENT_WINDOW_DAYS dias,
    // refeito sempre que o TTL passar desde o último ciclo completo (status
    // de tarefa muda; dia antigo já sincronizado uma vez fica estável).
    const recentStale = !lastRecentCycleAt || Date.now() - new Date(lastRecentCycleAt).getTime() > ttlMs;
    if (recentStale || (previous.cursorDate && previous.cursorDate < today)) {
      let day = previous.cursorDate && previous.cursorDate < today ? previous.cursorDate : today;
      while (day >= recentFloor) {
        if (remainingMs(deadlineAt) <= 0) {
          ranOutOfBudget = true;
          break;
        }
        const { tasks, incomplete } = await fetchDayTasks(provider, day, deadlineAt);
        await upsertTasks(db, tasks);
        taskCount += tasks.filter((t) => CUSTOMER_PANEL_TASK_TYPES.includes(t.taskTypeName)).length;
        daysProcessed += 1;
        if (incomplete) {
          ranOutOfBudget = true;
          break;
        }
        day = addDays(day, -1);
      }

      if (!ranOutOfBudget && day < recentFloor) {
        lastRecentCycleAt = new Date().toISOString();
        cursorDate = today;
      } else {
        cursorDate = day;
      }
    }
  }

  const meta: AuvoTasksSyncMeta = {
    status: ranOutOfBudget ? "partial" : "ok",
    cursorDate,
    backfillComplete,
    lastRecentCycleAt,
    lastRunAt: new Date().toISOString(),
    taskCount,
    daysProcessed,
    error: null,
  };

  await logEvent(db, "auvo", "AUVO_TASKS_SYNC_SUCCESS", {
    status: meta.status,
    taskCount,
    daysProcessed,
    backfillComplete,
  });

  return meta;
}

export async function ensureFreshAuvoTasks(db: SupabaseClient, { force = false }: { force?: boolean } = {}): Promise<AuvoTasksSyncMeta> {
  const cached = await readCacheRow(db);
  const previous = cached?.payload ?? EMPTY_META;
  const ttlMs = getAuvoTasksSyncTtlSeconds() * 1000;
  const pending = !previous.backfillComplete;
  const isFresh = Boolean(!pending && cached?.generated_at && Date.now() - new Date(cached.generated_at).getTime() < ttlMs);

  if (isFresh && !force) return previous;

  const { data: claimed } = await db.rpc("claim_snapshot_refresh", { p_cache_key: CACHE_KEY, p_claim_ttl_seconds: CLAIM_TTL_SECONDS });
  const wonClaim = Array.isArray(claimed) ? claimed.length > 0 : Boolean(claimed);
  if (!wonClaim) return previous;

  try {
    const meta = await runTasksSync(db);
    await db
      .from("operational_snapshot_cache")
      .update({
        generated_at: new Date().toISOString(),
        payload: meta,
        refresh_claimed_at: null,
        last_error: null,
        last_error_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("cache_key", CACHE_KEY);
    return meta;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na sincronização de chamados.";
    await db.rpc("release_snapshot_refresh_claim", { p_cache_key: CACHE_KEY });
    await db
      .from("operational_snapshot_cache")
      .update({ last_error: message, last_error_at: new Date().toISOString() })
      .eq("cache_key", CACHE_KEY);
    await logEvent(db, "auvo", "AUVO_TASKS_SYNC_FAILURE", { message });
    return { ...previous, status: "error", error: message };
  }
}
