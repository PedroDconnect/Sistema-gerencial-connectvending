import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { vmpayGet } from "../integrations/vmpay.client.ts";
import { normalizeInstallation, normalizeLocation, normalizeMachine, normalizeVend } from "../integrations/vmpay.normalizer.ts";
import { Installation, Location, Machine, MonitoredMachine, VendWindowEntry } from "../integrations/types.ts";
import {
  VMPAY_VENDS_WINDOW_HOURS,
  VMPAY_VENDS_PAGE_SIZE,
  VMPAY_VENDS_MAX_PAGES,
  VMPAY_VENDS_FETCH_CONCURRENCY,
  VMPAY_INSTALLATIONS_PAGE_SIZE,
  VMPAY_INSTALLATIONS_MAX_PAGES,
  getVmpayCacheTtlSeconds,
  readVmpayCredentials,
  VmpayCredentials,
} from "../integrations/vmpay.config.ts";
import { classifyMachineStatus } from "./machineStatus.ts";
import { logEvent } from "../shared/logger.ts";
import { ControlledError } from "../shared/http.ts";

const CACHE_KEY = "machine_monitor";
const CLAIM_TTL_SECONDS = 60;

// Confirmado empiricamente: /machines ignora page/per_page e sempre
// devolve o array inteiro (775 máquinas no teste). Ainda assim não assume
// "1 chamada = pronto" sem checar — se um dia a API passar a paginar de
// verdade, isso aparece como length === per_page pedido, e logamos um
// aviso em vez de silenciosamente perder máquinas.
export async function fetchAllMachines(creds: VmpayCredentials, db: SupabaseClient): Promise<Machine[]> {
  const raw = await vmpayGet(creds.baseUrl, "/machines", creds.accessToken, { page: 1, per_page: 1000 });
  if (!Array.isArray(raw)) throw new ControlledError("Resposta inesperada da VMpay em /machines.", 502);
  if (raw.length === 1000) {
    await logEvent(db, "vmpay", "VMPAY_MACHINES_SUSPECT_TRUNCATION", { count: raw.length });
  }
  return raw.map((m) => normalizeMachine(m as Record<string, unknown>));
}

// /locations (sem filtro) é outro endpoint em lote confirmado — mesmo
// comportamento de /machines (ignora page/per_page, devolve tudo, 402
// locations no teste). É o que dá o nome de cliente/site (installation só
// tem location_id) pra tabela — sem isso a coluna "Cliente" pedida não
// tem de onde vir.
async function fetchAllLocations(creds: VmpayCredentials, db: SupabaseClient): Promise<Location[]> {
  const raw = await vmpayGet(creds.baseUrl, "/locations", creds.accessToken, { page: 1, per_page: 1000 });
  if (!Array.isArray(raw)) throw new ControlledError("Resposta inesperada da VMpay em /locations.", 502);
  if (raw.length === 1000) {
    await logEvent(db, "vmpay", "VMPAY_LOCATIONS_SUSPECT_TRUNCATION", { count: raw.length });
  }
  return raw.map((l) => normalizeLocation(l as Record<string, unknown>));
}

// /installations (sem machine_id) é o endpoint em lote confirmado — evita
// 1 chamada por máquina. Pagina de verdade (per_page respeitado), então
// aqui o loop de página faz sentido de fato.
async function fetchAllInstallations(creds: VmpayCredentials): Promise<Installation[]> {
  const all: Installation[] = [];
  for (let page = 1; page <= VMPAY_INSTALLATIONS_MAX_PAGES; page++) {
    const raw = await vmpayGet(creds.baseUrl, "/installations", creds.accessToken, {
      page,
      per_page: VMPAY_INSTALLATIONS_PAGE_SIZE,
    });
    if (!Array.isArray(raw)) throw new ControlledError("Resposta inesperada da VMpay em /installations.", 502);
    all.push(...raw.map((i) => normalizeInstallation(i as Record<string, unknown>)));
    if (raw.length < VMPAY_INSTALLATIONS_PAGE_SIZE) break;
  }
  return all;
}

// Regra crítica do módulo: nunca mais que a janela configurada
// (VMPAY_VENDS_WINDOW_HOURS). start_date/end_date são filtro real
// confirmado contra a API (janela em 2010 devolveu 0 registros) — a
// chamada já sai restrita à janela, nunca busca histórico.
//
// A VMpay não devolve contagem total (sem envelope, array puro), então
// não tem como saber de antemão quantas páginas existem. Em vez de buscar
// 1 página por vez (N round-trips sequenciais — lento: numa janela de 24h,
// ~38 páginas seguidas), busca em RODADAS de VMPAY_VENDS_FETCH_CONCURRENCY
// páginas em paralelo, e só para quando uma rodada trouxer alguma página
// incompleta (< page size, sinal de que chegou ao fim). Pior caso comum:
// ~38 páginas em 8 rodadas em vez de 38 chamadas sequenciais.
async function fetchVendsWindow(
  creds: VmpayCredentials,
  windowFromIso: string,
  windowToIso: string,
  db: SupabaseClient
): Promise<{ vends: ReturnType<typeof normalizeVend>[]; pages: number }> {
  const pagesFetched: ReturnType<typeof normalizeVend>[][] = [];
  let nextPage = 1;
  let reachedEnd = false;

  while (!reachedEnd && nextPage <= VMPAY_VENDS_MAX_PAGES) {
    const batch: number[] = [];
    for (let i = 0; i < VMPAY_VENDS_FETCH_CONCURRENCY && nextPage <= VMPAY_VENDS_MAX_PAGES; i++, nextPage++) {
      batch.push(nextPage);
    }

    const results = await Promise.all(
      batch.map((page) =>
        vmpayGet(creds.baseUrl, "/vends", creds.accessToken, {
          page,
          per_page: VMPAY_VENDS_PAGE_SIZE,
          start_date: windowFromIso,
          end_date: windowToIso,
        }).then((raw) => ({ page, raw }))
      )
    );

    for (const { page, raw } of results.sort((a, b) => a.page - b.page)) {
      if (!Array.isArray(raw)) throw new ControlledError("Resposta inesperada da VMpay em /vends.", 502);
      pagesFetched[page] = raw.map((v) => normalizeVend(v as Record<string, unknown>));
      if (raw.length < VMPAY_VENDS_PAGE_SIZE) reachedEnd = true;
    }
  }

  if (!reachedEnd) {
    await logEvent(db, "vmpay", "VMPAY_VENDS_HIT_PAGE_CAP", { maxPages: VMPAY_VENDS_MAX_PAGES });
  }

  const vends = pagesFetched.flat();
  return { vends, pages: pagesFetched.filter(Boolean).length };
}

// Seção 7 do pedido: índice simples, não guarda a venda inteira. Set/Map,
// uma passada, sem loop aninhado (seção 26).
function buildVendIndex(vends: ReturnType<typeof normalizeVend>[]): Map<number, VendWindowEntry> {
  const index = new Map<number, VendWindowEntry>();
  for (const vend of vends) {
    const entry = index.get(vend.machineId);
    if (!entry) {
      index.set(vend.machineId, { lastVendAt: vend.occurredAt, vendCount: 1, totalQuantity: vend.quantity });
      continue;
    }
    entry.vendCount += 1;
    entry.totalQuantity += vend.quantity;
    if (vend.occurredAt > entry.lastVendAt) entry.lastVendAt = vend.occurredAt;
  }
  return index;
}

export interface MachineMonitorSummary {
  totalMachines: number;
  machinesWithVends: number;
  withoutVends: number;
  noInstallation: number;
  dataUnavailable: number;
}

export interface MachineMonitorSnapshot {
  generatedAt: string;
  window: { from: string; to: string };
  summary: MachineMonitorSummary;
  machines: MonitoredMachine[];
  vendsUnavailable: boolean;
  installationsUnavailable: boolean;
  dataIncomplete: boolean;
}

async function computeSnapshot(db: SupabaseClient): Promise<MachineMonitorSnapshot> {
  const creds = readVmpayCredentials();
  const now = new Date();
  const windowFrom = new Date(now.getTime() - VMPAY_VENDS_WINDOW_HOURS * 3_600_000);
  const windowFromIso = windowFrom.toISOString();
  const windowToIso = now.toISOString();

  const t0 = Date.now();

  // As 4 buscas não dependem uma da outra (só o cruzamento em memória,
  // depois, precisa de todas) — disparar tudo junto em vez de esperar
  // /machines terminar pra só então começar o resto é a maior otimização
  // de tempo disponível aqui (evita pagar a latência de /machines duas
  // vezes, uma sozinha e outra dentro do Promise.allSettled).
  const [machinesResult, installationsResult, vendsResult, locationsResult] = await Promise.allSettled([
    fetchAllMachines(creds, db),
    fetchAllInstallations(creds),
    fetchVendsWindow(creds, windowFromIso, windowToIso, db),
    fetchAllLocations(creds, db),
  ]);

  // /machines é tratado como obrigatório: se falhar e não houver cache
  // (ver getMachineMonitorSnapshot), não tem como devolver nada de real —
  // erro controlado sobe, nunca "0 máquinas" (seção 22).
  if (machinesResult.status === "rejected") {
    throw machinesResult.reason;
  }
  const machines = machinesResult.value;
  await logEvent(db, "vmpay", "VMPAY_MACHINES_FETCHED", { count: machines.length, durationMs: Date.now() - t0 });

  const installationsUnavailable = installationsResult.status === "rejected";
  const vendsUnavailable = vendsResult.status === "rejected";

  if (installationsUnavailable) {
    await logEvent(db, "vmpay", "VMPAY_INSTALLATIONS_ERROR", {
      error: String((installationsResult as PromiseRejectedResult).reason),
    });
  }
  if (vendsUnavailable) {
    await logEvent(db, "vmpay", "VMPAY_VENDS_ERROR", {
      error: String((vendsResult as PromiseRejectedResult).reason),
    });
  }
  // locationName é só informativo (não entra na classificação) — se
  // /locations falhar, a coluna "Cliente" fica em branco, mas não é
  // motivo pra marcar a máquina como "data_unavailable".
  if (locationsResult.status === "rejected") {
    await logEvent(db, "vmpay", "VMPAY_LOCATIONS_ERROR", { error: String(locationsResult.reason) });
  }

  const installations = installationsResult.status === "fulfilled" ? installationsResult.value : [];
  const vendsPages = vendsResult.status === "fulfilled" ? vendsResult.value.pages : 0;
  const vends = vendsResult.status === "fulfilled" ? vendsResult.value.vends : [];
  const locations = locationsResult.status === "fulfilled" ? locationsResult.value : [];
  const locationNameById = new Map<number, string>(locations.map((l) => [l.id, l.name]));

  if (!vendsUnavailable) {
    await logEvent(db, "vmpay", "VMPAY_VENDS_FETCHED", {
      count: vends.length,
      pages: vendsPages,
      windowFrom: windowFromIso,
      windowTo: windowToIso,
    });
  }

  const installationByMachine = new Map<number, Installation>();
  for (const installation of installations) installationByMachine.set(installation.machineId, installation);

  const vendIndex = buildVendIndex(vends);

  const summary: MachineMonitorSummary = {
    totalMachines: machines.length,
    machinesWithVends: 0,
    withoutVends: 0,
    noInstallation: 0,
    dataUnavailable: 0,
  };

  const monitored: MonitoredMachine[] = machines.map((machine) => {
    const installation = installationByMachine.get(machine.id) ?? null;
    const vend = vendIndex.get(machine.id) ?? null;
    const status = classifyMachineStatus(installation, vend, {
      vendsUnavailable,
      installationsUnavailable,
    });

    switch (status) {
      case "operating":
        summary.machinesWithVends += 1;
        break;
      case "no_doses":
        summary.withoutVends += 1;
        break;
      case "no_installation":
        summary.noInstallation += 1;
        break;
      case "data_unavailable":
        summary.dataUnavailable += 1;
        break;
    }

    return {
      machineId: machine.id,
      assetNumber: machine.assetNumber,
      machineModelId: machine.machineModelId,
      tags: machine.tags,
      installationId: installation?.id ?? null,
      locationId: installation?.locationId ?? null,
      locationName: installation?.locationId ? locationNameById.get(installation.locationId) ?? null : null,
      place: installation?.place ?? null,
      operationStatus: installation?.operationStatus ?? null,
      states: installation?.states ?? [],
      lastCommunicationAt: installation?.lastCommunicationAt ?? null,
      connection: installation?.connection ?? null,
      lastVendAt: vend?.lastVendAt ?? null,
      vendCountLast2Hours: vend?.vendCount ?? 0,
      quantityLast2Hours: vend?.totalQuantity ?? 0,
      status,
    };
  });

  await logEvent(db, "vmpay", "VMPAY_SNAPSHOT_COMPUTED", {
    ...summary,
    durationMs: Date.now() - t0,
    vendsUnavailable,
    installationsUnavailable,
  });

  return {
    generatedAt: now.toISOString(),
    window: { from: windowFromIso, to: windowToIso },
    summary,
    machines: monitored,
    vendsUnavailable,
    installationsUnavailable,
    dataIncomplete: vendsUnavailable || installationsUnavailable,
  };
}

interface CacheRow {
  generated_at: string | null;
  payload: MachineMonitorSnapshot | null;
}

async function readCache(db: SupabaseClient): Promise<CacheRow | null> {
  const { data } = await db
    .from("operational_snapshot_cache")
    .select("generated_at, payload")
    .eq("cache_key", CACHE_KEY)
    .maybeSingle();
  return data ?? null;
}

async function writeCache(db: SupabaseClient, snapshot: MachineMonitorSnapshot): Promise<void> {
  await db
    .from("operational_snapshot_cache")
    .upsert({
      cache_key: CACHE_KEY,
      generated_at: snapshot.generatedAt,
      window_from: snapshot.window.from,
      window_to: snapshot.window.to,
      payload: snapshot,
      data_incomplete: snapshot.dataIncomplete,
      refresh_claimed_at: null,
      last_error: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    });
}

// Leitura com cache: só recalcula quando expira o TTL (ou ?refresh=1), e
// só uma requisição concorrente ganha o direito de recalcular (mesmo
// padrão de claim_token_refresh) — evita N usuários abrindo a tela juntos
// dispararem N varreduras na VMpay (seção 17/18 do pedido).
export async function getMachineMonitorSnapshot(
  db: SupabaseClient,
  forceRefresh: boolean
): Promise<MachineMonitorSnapshot> {
  const cached = await readCache(db);
  const ttlMs = getVmpayCacheTtlSeconds() * 1000;
  const isFresh = Boolean(cached?.generated_at && Date.now() - new Date(cached.generated_at).getTime() < ttlMs);

  if (isFresh && !forceRefresh && cached?.payload) {
    return cached.payload;
  }

  const { data: claimed } = await db.rpc("claim_snapshot_refresh", {
    p_cache_key: CACHE_KEY,
    p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
  });
  const wonClaim = Array.isArray(claimed) ? claimed.length > 0 : Boolean(claimed);

  if (!wonClaim) {
    // Outra requisição já está recalculando — devolve o cache existente
    // (mesmo que velho) em vez de esperar. É leitura de dashboard, não
    // precisa do dado do segundo exato.
    if (cached?.payload) return cached.payload;
    throw new ControlledError(
      "Os dados de telemetria ainda estão sendo calculados por outra requisição. Tente novamente em alguns segundos.",
      503
    );
  }

  try {
    const snapshot = await computeSnapshot(db);
    await writeCache(db, snapshot);
    return snapshot;
  } catch (error) {
    await db.rpc("release_snapshot_refresh_claim", { p_cache_key: CACHE_KEY });
    await db
      .from("operational_snapshot_cache")
      .update({ last_error: error instanceof Error ? error.message : String(error), last_error_at: new Date().toISOString() })
      .eq("cache_key", CACHE_KEY);

    if (cached?.payload) {
      await logEvent(db, "vmpay", "VMPAY_SNAPSHOT_STALE_FALLBACK", { error: String(error) });
      return { ...cached.payload, dataIncomplete: true };
    }
    throw error;
  }
}
