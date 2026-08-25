import { IntegrationProvider, Task, TaskFilters, TaskListParams, TaskPage } from "../integrations/types.ts";
import { ALL_TASK_STATUSES, TaskStatus, taskStatusLabel } from "./status.ts";
import { ControlledError } from "../shared/http.ts";
import { getOrSet } from "../shared/cache.ts";
import { DAILY_TYPE_CATEGORIES, classifyDailyTypeCategory } from "./taskTypeCategories.ts";
import { AUVO_CONCURRENCY_LIMIT } from "../integrations/auvo/auvo.config.ts";

// A Auvo não pagina barato: cada tarefa vem com questionários, fotos,
// produtos etc. (payloads de centenas de KB por página de 100). Buscar
// ~1000 tarefas/dia deste cliente já leva ~15-20s. Sem uma cache curta
// COMPARTILHADA entre endpoints, o /summary, /by-type, /by-technician e
// /by-customer — que o frontend chama quase juntos ao abrir a tela —
// cada um refaria essa busca inteira sozinho (4x o custo). getOrSet aqui
// deduplica: todos reaproveitam a mesma busca em voo/recente, chaveada só
// pelos filtros que realmente vão pra Auvo (sem "status", que nunca é
// enviado — ver nota abaixo).
const SHARED_FETCH_TTL_MS = 30_000;

// A plataforma do Supabase mata a Function em 150s de execução (erro
// genérico "IDLE_TIMEOUT", sem chance de resposta nossa) — confirmado ao
// vivo num dia em que a Auvo ficou lenta: o retry interno de várias
// páginas somado passou de 150s antes de qualquer uma das nossas
// mensagens de erro conseguir sair. Esse prazo garante que a Function
// SEMPRE devolve algo nosso (dados parciais + dataIncomplete=true) com
// folga antes desse teto, em vez de arriscar o corte seco da plataforma.
const FETCH_DEADLINE_MS = 100_000;

// Acima disso, agregar (by-type/by-technician/by-customer/summary/tasks
// com filtro de status) exigiria paginar tarefas demais — melhor pedir
// para o usuário refinar o filtro do que travar a função por minutos. Só
// esse cliente já tem ~1000 tarefas/dia; 31 dias sem esse corte passaria
// de 30 mil.
const AGGREGATION_SAFE_LIMIT = 3000;
const AGGREGATION_PAGE_SIZE = 100; // teto da própria Auvo
const AGGREGATION_MAX_PAGES = Math.ceil(AGGREGATION_SAFE_LIMIT / AGGREGATION_PAGE_SIZE);

async function safeCount(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch {
    return 0;
  }
}

interface PageFetchResult {
  tasks: Task[];
  incomplete: boolean;
}

function remainingMs(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now());
}

// Corre fn contra o que resta do orçamento total do request — se o prazo
// vence primeiro, devolve null e a chamada de verdade fica órfã (segue
// rodando até o próprio AbortController dela abortar, mas o resultado não
// é mais esperado por ninguém). Isso é o que garante o teto de
// FETCH_DEADLINE_MS mesmo quando uma página trava bem mais que o timeout
// individual dela sozinha sugeriria (múltiplas tentativas de retry somam).
async function withDeadline<T>(deadlineAt: number, fn: () => Promise<T>): Promise<T | null> {
  const budget = remainingMs(deadlineAt);
  if (budget <= 0) return null;
  return Promise.race([fn(), new Promise<null>((resolve) => setTimeout(() => resolve(null), budget))]);
}

// Sob instabilidade da Auvo (ela mesma passa a demorar/errar quando recebe
// várias chamadas concorrentes com volume alto de tarefas — não é algo
// que a gente controle), uma página que falhasse depois de todas as
// tentativas antes derrubava a busca inteira, e mesmo com esse erro
// tratado, o retry somado de várias páginas lentas já bateu no teto de
// execução da própria plataforma (ver FETCH_DEADLINE_MS). Agora: cada
// página que falha OU não responde dentro do prazo geral entra como vazia
// e o resto segue — melhor números parciais de tarefas reais (sinalizados
// via `incomplete`) do que a tela toda zerada ou a Function sendo matada
// sem chance de resposta.
// A contagem devia ser "quase grátis" (pageSize=1, com AUVO_COUNT_TIMEOUT_MS
// dedicado — mais curto que o das páginas), mas ainda passa por até 3
// tentativas de retry — se deixasse ela correr contra o prazo geral
// inteiro, uma contagem lenta podia sozinha consumir o orçamento todo e
// não sobrar nada pro loop de páginas. 40s cobre as 3 tentativas
// (3×12s + backoff ≈ 37s) com uma margem pequena, sem comer demais do
// FETCH_DEADLINE_MS total.
const COUNT_BUDGET_MS = 40_000;

async function fetchAllForProviderFilters(
  provider: IntegrationProvider,
  providerFilters: TaskFilters
): Promise<PageFetchResult> {
  const deadlineAt = Date.now() + FETCH_DEADLINE_MS;
  const countDeadlineAt = Math.min(deadlineAt, Date.now() + COUNT_BUDGET_MS);

  const total = await withDeadline(countDeadlineAt, () => provider.countTasks(providerFilters).catch(() => -1));
  if (total === null || total === -1) {
    // Nem a contagem respondeu/deu certo — não é "zero tarefas de
    // verdade", é "não sabemos", então não finge que sabe.
    return { tasks: [], incomplete: true };
  }
  if (total > AGGREGATION_SAFE_LIMIT) {
    throw new ControlledError("Período amplo. Refine os filtros para realizar uma auditoria.", 422);
  }
  if (total === 0) return { tasks: [], incomplete: false };

  const pages = Math.min(Math.ceil(total / AGGREGATION_PAGE_SIZE), AGGREGATION_MAX_PAGES);
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
  const items: Task[] = [];
  let incomplete = false;
  let cursor = 0;

  async function worker() {
    while (cursor < pageNumbers.length) {
      if (remainingMs(deadlineAt) <= 0) {
        incomplete = true;
        return;
      }
      const page = pageNumbers[cursor++];
      const result = await withDeadline(deadlineAt, () =>
        provider.listTasks({ ...providerFilters, page, pageSize: AGGREGATION_PAGE_SIZE }).catch(() => null)
      );
      if (result) items.push(...result.items);
      else incomplete = true;
    }
  }

  const workerCount = Math.min(Math.max(AUVO_CONCURRENCY_LIMIT, 1), pages);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return { tasks: items, incomplete };
}

// Confirmado empiricamente contra a API real: o filtro "status" da Auvo
// não é confiável — para valores como 2, 3 e 4 ela ignora o filtro e
// devolve tarefas de outro status (chegamos a receber taskStatus=5 ao
// filtrar por status=2), e para outros valores (1, 6, aqui) ela responde
// 404/500 quando o resultado seria zero. Por isso "status" NUNCA é
// enviado para a Auvo (ver auvo.provider.ts) — toda contagem/filtro por
// status abaixo é feita sobre tarefas reais já buscadas, no nosso lado.
async function fetchTasksForRange(provider: IntegrationProvider, filters: TaskFilters): Promise<PageFetchResult> {
  const { status, sla, typeCategory, ...providerFilters } = filters;
  const cacheKey = `operation-tasks:${JSON.stringify(providerFilters)}`;
  const { tasks, incomplete } = await getOrSet(cacheKey, SHARED_FETCH_TTL_MS, () =>
    fetchAllForProviderFilters(provider, providerFilters)
  );

  let result = status ? tasks.filter((t) => t.status === status) : tasks;
  if (sla) result = result.filter((t) => taskSlaStatus(t) === sla);
  if (typeCategory) result = result.filter((t) => classifyDailyTypeCategory(t.taskTypeName) === typeCategory);
  return { tasks: result, incomplete };
}

export interface SummaryResult {
  dateFrom: string;
  dateTo: string;
  total: number;
  opened: number;
  inDisplacement: number;
  checkedIn: number;
  checkedOut: number;
  finished: number;
  paused: number;
  completionRate: number;
  generatedAt: string;
}

function summarize(tasks: Task[], filters: TaskFilters): SummaryResult {
  const counts = Object.fromEntries(ALL_TASK_STATUSES.map((status) => [status, 0])) as Record<number, number>;
  for (const task of tasks) {
    if (counts[task.status] !== undefined) counts[task.status] += 1;
  }

  const total = tasks.length;
  const finished = counts[TaskStatus.FINISHED] ?? 0;

  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    total,
    opened: counts[TaskStatus.OPENED] ?? 0,
    inDisplacement: counts[TaskStatus.IN_DISPLACEMENT] ?? 0,
    checkedIn: counts[TaskStatus.CHECKED_IN] ?? 0,
    checkedOut: counts[TaskStatus.CHECKED_OUT] ?? 0,
    finished,
    paused: counts[TaskStatus.PAUSED] ?? 0,
    completionRate: total > 0 ? Math.round((finished / total) * 1000) / 10 : 0,
    generatedAt: new Date().toISOString(),
  };
}

// Rápido: um único countTasks (sem status, que é o único filtro que a
// Auvo não aceita de forma confiável) — usado pra pintar "Tarefas hoje" na
// tela quase instantaneamente, antes do resto (que precisa buscar as
// tarefas de verdade) chegar.
export interface QuickTotalResult {
  dateFrom: string;
  dateTo: string;
  total: number;
  generatedAt: string;
}

export async function getQuickTotal(provider: IntegrationProvider, filters: TaskFilters): Promise<QuickTotalResult> {
  const { status: _ignoredStatus, sla: _ignoredSla, typeCategory: _ignoredTypeCategory, ...providerFilters } = filters;
  const total = await safeCount(() => provider.countTasks(providerFilters));
  return { dateFrom: filters.dateFrom, dateTo: filters.dateTo, total, generatedAt: new Date().toISOString() };
}

export interface BreakdownRow {
  key: string;
  label: string;
  total: number;
  finished: number;
  completionRate: number;
}

function aggregate(tasks: Task[], keyOf: (t: Task) => string, labelOf: (t: Task) => string): BreakdownRow[] {
  const groups = new Map<string, { label: string; total: number; finished: number }>();

  for (const task of tasks) {
    const key = keyOf(task);
    const entry = groups.get(key) ?? { label: labelOf(task), total: 0, finished: 0 };
    entry.total += 1;
    if (task.status === TaskStatus.FINISHED) entry.finished += 1;
    groups.set(key, entry);
  }

  return Array.from(groups.entries())
    .map(([key, { label, total, finished }]) => ({
      key,
      label,
      total,
      finished,
      completionRate: total > 0 ? Math.round((finished / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function getByType(provider: IntegrationProvider, filters: TaskFilters): Promise<BreakdownRow[]> {
  const { tasks } = await fetchTasksForRange(provider, filters);
  return aggregate(
    tasks,
    (t) => String(t.taskTypeId),
    (t) => t.taskTypeName || "Não informado"
  );
}

export async function getByTechnician(provider: IntegrationProvider, filters: TaskFilters): Promise<BreakdownRow[]> {
  const { tasks } = await fetchTasksForRange(provider, filters);
  return aggregate(
    tasks,
    (t) => String(t.technicianId),
    (t) => t.technicianName || "Não informado"
  );
}

export async function getByCustomer(provider: IntegrationProvider, filters: TaskFilters): Promise<BreakdownRow[]> {
  const { tasks } = await fetchTasksForRange(provider, filters);
  return aggregate(
    tasks,
    (t) => String(t.customerId),
    (t) => t.customerName || "Não informado"
  );
}

// Categorias pedidas explicitamente: nomes de tipo confirmados nos dados
// reais da Auvo (ver taskTypeName), não inventados. Tudo que não bater
// exatamente com um destes três cai em "outros" — nenhuma tarefa é
// descartada, só não entra num balde nomeado.
const CUSTOMER_TYPE_CATEGORIES: Array<{ key: "abastecimento" | "corretivo" | "vmpayUppay"; label: string; match: string }> = [
  { key: "abastecimento", label: "Abastecimento", match: "Abastecimento - Chamado" },
  { key: "corretivo", label: "Téc. Corretivo", match: "Chamado Técnico corretivo" },
  { key: "vmpayUppay", label: "VmPay/UpPay", match: "Chamado VmPay / UpPay" },
];

function classifyTaskType(taskTypeName: string): "abastecimento" | "corretivo" | "vmpayUppay" | "outros" {
  const found = CUSTOMER_TYPE_CATEGORIES.find((c) => c.match === taskTypeName);
  return found?.key ?? "outros";
}

export interface CustomerTypeRow {
  customerId: string;
  customerName: string;
  total: number;
  abastecimento: number;
  corretivo: number;
  vmpayUppay: number;
  outros: number;
}

function aggregateByCustomerType(tasks: Task[]): CustomerTypeRow[] {
  const groups = new Map<string, CustomerTypeRow>();

  for (const task of tasks) {
    const key = String(task.customerId);
    const entry =
      groups.get(key) ??
      ({
        customerId: key,
        customerName: task.customerName || "Não informado",
        total: 0,
        abastecimento: 0,
        corretivo: 0,
        vmpayUppay: 0,
        outros: 0,
      } as CustomerTypeRow);

    entry.total += 1;
    entry[classifyTaskType(task.taskTypeName)] += 1;
    groups.set(key, entry);
  }

  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
}

// SLA = 4h, pedido explicitamente: da abertura (creationDate) até o
// checkout (checkOutDate). Só entra na conta quem já tem os dois campos —
// tarefa sem checkout ainda não tem "tempo de atendimento" de verdade,
// então não conta nem a favor nem contra o SLA de ninguém.
const SLA_HOURS = 4;

function taskDurationHours(task: Task): number | null {
  if (!task.creationDate || !task.checkOutDate) return null;
  const start = new Date(task.creationDate).getTime();
  const end = new Date(task.checkOutDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 3_600_000;
}

// SLA se aplica só a chamado corretivo e chamado de abastecimento —
// pedido explicitamente. VmPay/UpPay, Abastecimento Rotina, Preventiva
// etc. nunca entram nessa conta, nem na tabela nem no filtro.
function isSlaEligible(task: Task): boolean {
  const category = classifyTaskType(task.taskTypeName);
  return category === "abastecimento" || category === "corretivo";
}

export type SlaStatus = "within" | "outside" | "pending" | "not_applicable";

function taskSlaStatus(task: Task): SlaStatus {
  if (!isSlaEligible(task)) return "not_applicable";
  const duration = taskDurationHours(task);
  if (duration === null) return "pending";
  return duration <= SLA_HOURS ? "within" : "outside";
}

export interface CustomerSlaRow {
  customerId: string;
  customerName: string;
  completed: number;
  avgDurationHours: number | null;
  withinSla: number;
  outsideSla: number;
  slaComplianceRate: number;
}

function aggregateBySla(tasks: Task[]): CustomerSlaRow[] {
  const groups = new Map<
    string,
    { customerName: string; durations: number[]; withinSla: number; outsideSla: number }
  >();

  for (const task of tasks) {
    if (!isSlaEligible(task)) continue;
    const duration = taskDurationHours(task);
    if (duration === null) continue;

    const key = String(task.customerId);
    const entry =
      groups.get(key) ?? { customerName: task.customerName || "Não informado", durations: [], withinSla: 0, outsideSla: 0 };
    entry.durations.push(duration);
    if (duration <= SLA_HOURS) entry.withinSla += 1;
    else entry.outsideSla += 1;
    groups.set(key, entry);
  }

  return Array.from(groups.entries())
    .map(([customerId, { customerName, durations, withinSla, outsideSla }]) => {
      const completed = durations.length;
      const avg = completed > 0 ? durations.reduce((a, b) => a + b, 0) / completed : null;
      return {
        customerId,
        customerName,
        completed,
        avgDurationHours: avg !== null ? Math.round(avg * 10) / 10 : null,
        withinSla,
        outsideSla,
        slaComplianceRate: completed > 0 ? Math.round((withinSla / completed) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.completed - a.completed);
}

export interface DailyTypeMetricCustomerRow {
  customerId: string;
  customerName: string;
  total: number;
  open: number;
  finished: number;
}

export interface DailyTypeMetric {
  key: string;
  label: string;
  total: number;
  open: number;
  finished: number;
  completionRate: number;
  byCustomer: DailyTypeMetricCustomerRow[];
}

// Métricas do dia pedidas explicitamente pelo CEO — 7 categorias fixas
// (ver taskTypeCategories.ts), sempre presentes na resposta mesmo com 0
// tarefas (ex.: "Chamado logística", que ainda não apareceu nos dados
// reais), para o card já existir no painel em vez de aparecer/desaparecer.
// byCustomer vai junto (mesma passada, sem custo extra) pra alimentar o
// popup "Visualizar" instantaneamente, sem round-trip nenhum — só a lista
// de tarefas de um cliente específico, quando o usuário abre uma linha
// dentro do popup, é que pede de verdade (GET /tasks?typeCategory=...).
function aggregateDailyTypeMetrics(tasks: Task[]): DailyTypeMetric[] {
  const totals = new Map(DAILY_TYPE_CATEGORIES.map((c) => [c.key, { total: 0, finished: 0 }]));
  const byCustomer = new Map<string, Map<string, { customerName: string; total: number; finished: number }>>(
    DAILY_TYPE_CATEGORIES.map((c) => [c.key, new Map()])
  );

  for (const task of tasks) {
    const key = classifyDailyTypeCategory(task.taskTypeName);
    if (!key) continue;
    const isFinished = task.status === TaskStatus.FINISHED;

    const totalsEntry = totals.get(key)!;
    totalsEntry.total += 1;
    if (isFinished) totalsEntry.finished += 1;

    const customerMap = byCustomer.get(key)!;
    const customerKey = String(task.customerId);
    const customerEntry = customerMap.get(customerKey) ?? {
      customerName: task.customerName || "Não informado",
      total: 0,
      finished: 0,
    };
    customerEntry.total += 1;
    if (isFinished) customerEntry.finished += 1;
    customerMap.set(customerKey, customerEntry);
  }

  return DAILY_TYPE_CATEGORIES.map(({ key, label }) => {
    const { total, finished } = totals.get(key)!;
    const customerRows = Array.from(byCustomer.get(key)!.entries())
      .map(([customerId, { customerName, total, finished }]) => ({
        customerId,
        customerName,
        total,
        finished,
        open: total - finished,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      key,
      label,
      total,
      finished,
      open: total - finished,
      completionRate: total > 0 ? Math.round((finished / total) * 1000) / 10 : 0,
      byCustomer: customerRows,
    };
  });
}

export interface OverviewResult extends SummaryResult {
  byType: BreakdownRow[];
  byTechnician: BreakdownRow[];
  byCustomer: BreakdownRow[];
  byCustomerType: CustomerTypeRow[];
  customerTypeCategories: Array<{ key: string; label: string }>;
  byCustomerSla: CustomerSlaRow[];
  slaHours: number;
  dailyTypeMetrics: DailyTypeMetric[];
  // true quando pelo menos uma página da Auvo falhou mesmo após retry —
  // os números abaixo são de tarefas reais, só que de um subconjunto do
  // período (nunca inventado/estimado). Ver fetchAllForProviderFilters.
  dataIncomplete: boolean;
}

// O frontend abre a tela precisando de resumo + 3 agrupamentos ao mesmo
// tempo. Se cada um chamasse seu próprio endpoint, seriam 4 buscas
// completas em paralelo — e cada busca já leva ~15-20s nesse volume,
// então 4 ao mesmo tempo (~40+ chamadas concorrentes à Auvo) chegou a
// dar timeout em teste real. Uma única busca, agregada de 4 formas
// diferentes em memória, resolve isso pela raiz em vez de depender de
// cache entre isolates (que não é garantida — mesmo motivo por trás do
// TokenManager usar Postgres em vez de memória).
export async function getOverview(provider: IntegrationProvider, filters: TaskFilters): Promise<OverviewResult> {
  const { tasks, incomplete } = await fetchTasksForRange(provider, filters);

  return {
    ...summarize(tasks, filters),
    byType: aggregate(
      tasks,
      (t) => String(t.taskTypeId),
      (t) => t.taskTypeName || "Não informado"
    ),
    byTechnician: aggregate(
      tasks,
      (t) => String(t.technicianId),
      (t) => t.technicianName || "Não informado"
    ),
    byCustomer: aggregate(
      tasks,
      (t) => String(t.customerId),
      (t) => t.customerName || "Não informado"
    ),
    byCustomerType: aggregateByCustomerType(tasks),
    customerTypeCategories: CUSTOMER_TYPE_CATEGORIES.map(({ key, label }) => ({ key, label })),
    byCustomerSla: aggregateBySla(tasks),
    slaHours: SLA_HOURS,
    dailyTypeMetrics: aggregateDailyTypeMetrics(tasks),
    dataIncomplete: incomplete,
  };
}

// Sem filtro de status/SLA: repassa direto pra paginação nativa da Auvo
// (mais barato). Com qualquer um dos dois: busca o conjunto (sem mandar
// "status"/"sla" pra Auvo — nenhum dos dois é campo dela, ver
// fetchTasksForRange), filtra e pagina aqui mesmo, porque a paginação
// nativa da Auvo não tem como saber do filtro que só nós aplicamos depois.
export async function getTasksPage(provider: IntegrationProvider, params: TaskListParams): Promise<TaskPage> {
  if (!params.status && !params.sla && !params.typeCategory) {
    return provider.listTasks(params);
  }

  const { tasks } = await fetchTasksForRange(provider, params);
  const start = (params.page - 1) * params.pageSize;

  return {
    items: tasks.slice(start, start + params.pageSize),
    total: tasks.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export { taskStatusLabel, taskSlaStatus, isSlaEligible };
