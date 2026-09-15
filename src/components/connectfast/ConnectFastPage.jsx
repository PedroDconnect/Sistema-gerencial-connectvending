import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { StatTile } from "../ativos/StatTile";
import { BreakdownTable } from "../operacao/BreakdownTable";
import { TaskDetailDrawer } from "../operacao/TaskDetailDrawer";
import { OpenTicketChooser } from "../preparations/OpenTicketChooser";
import { NewOrderWizard } from "../preparations/NewOrderWizard";
import { TechnicalVisitModal } from "../preparations/TechnicalVisitModal";
import { EntityDrawer } from "./EntityDrawer";
import { ClientesComMaquinas } from "./ClientesComMaquinas";
import { HistoricoTab } from "./HistoricoTab";
import { useOperacaoDetails } from "../../hooks/useOperacaoDetails";
import { useOperacaoCompletaCustomers } from "../../hooks/useOperacaoCompletaCustomers";

const PERIODS = [
  { id: "today", label: "Hoje", span: 0 },
  { id: "7d", label: "7 dias", span: 6 },
  { id: "30d", label: "30 dias", span: 29 },
];

// Categorias reais de supabase/functions/operation/service/taskTypeCategories.ts
// — "técnico" = tudo que não é reposição de produto; "operacional" =
// abastecimento (chamado avulso ou rotina programada). Não existe
// categoria "preventivo" hoje (ver docs/painel-connectfast-spec.md §5) —
// de propósito não entra em nenhum dos dois grupos.
const TECHNICAL_CATEGORY_KEYS = new Set([
  "chamadoCorretivo",
  "chamadoLogistica",
  "vmpayUppay",
  "degustacao",
  "finalizacaoMaquina",
]);
const OPERATIONAL_CATEGORY_KEYS = new Set(["abastecimentoChamado", "abastecimentoRotina"]);

// Mesma ordem fixa de supabase/functions/operation/service/taskTypeCategories.ts
// (DAILY_TYPE_CATEGORIES) — cor por posição, nunca recalculada por
// dataset, igual a qualquer outro gráfico do app.
const DAILY_TYPE_SERIES_COLORS = [
  "series-blue",
  "series-orange",
  "series-aqua",
  "series-yellow",
  "series-magenta",
  "series-green",
  "series-violet",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Período atual + período anterior de mesma duração imediatamente antes
// dele — a única comparação desta etapa (ver plano, "mesmo período em 30
// dias" fica pra depois pra não triplicar as chamadas à Auvo).
function buildRanges(periodId) {
  const preset = PERIODS.find((p) => p.id === periodId) ?? PERIODS[1];
  const today = todayIso();
  const dateTo = today;
  const dateFrom = addDaysIso(today, -preset.span);
  const prevDateTo = addDaysIso(dateFrom, -1);
  const prevDateFrom = addDaysIso(prevDateTo, -preset.span);
  return {
    current: { dateFrom, dateTo },
    previous: { dateFrom: prevDateFrom, dateTo: prevDateTo },
  };
}

function pctDelta(curr, prev) {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// Cartão de KPI com seta colorida por polaridade, não por direção bruta —
// pedido explícito do painel: uma queda em "corretivos abertos" é uma
// boa notícia (verde), a mesma queda em "realizados" é ruim (vermelho).
// "neutral" é pra métrica de volume onde subir/descer não é bom nem ruim
// por si só (ex.: atividades registradas).
function GerencialKpi({ label, value, icon, accent, delta, polarity = "neutral" }) {
  const color = `var(--${accent})`;
  let deltaModifier = "kpi-card__delta--neutral";
  let deltaIcon = "trendUp";
  let deltaLabel = "—";

  if (delta !== null && delta !== undefined) {
    deltaIcon = delta < 0 ? "trendDown" : "trendUp";
    deltaLabel = `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR")}%`;
    if (polarity !== "neutral") {
      const isGood = polarity === "goodDown" ? delta <= 0 : delta >= 0;
      deltaModifier = isGood ? "kpi-card__delta--up" : "kpi-card__delta--down";
    }
  }

  return (
    <article className="kpi-card">
      <div className="kpi-card__top">
        <span className="kpi-card__label">{label}</span>
        <span className="kpi-card__icon" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          <Icon name={icon} size={20} />
        </span>
      </div>
      <div className="kpi-card__value">{value.toLocaleString("pt-BR")}</div>
      <div className="kpi-card__bottom">
        <div className={`kpi-card__delta ${deltaModifier}`}>
          <Icon name={deltaIcon} size={13} strokeWidth={2.2} />
          <span>{deltaLabel}</span>
          <span className="kpi-card__delta-caption">vs período anterior</span>
        </div>
      </div>
    </article>
  );
}

// Cópia local do RankedBar de CustomerPanelDetailModal.jsx — mesmo padrão
// do resto do app (cada tela que usa .ranked-bar mantém sua própria cópia
// pequena em vez de importar um componente compartilhado).
function RankedBar({ label, sublabel, value, maxValue, onClick }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  const content = (
    <>
      <span className="ranked-bar__label">
        <span className="ranked-bar__name" title={label}>
          {label}
        </span>
        {sublabel && <span className="ranked-bar__sublabel">{sublabel}</span>}
      </span>
      <span className="ranked-bar__track">
        <span className="ranked-bar__fill" style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }} />
      </span>
      <span className="ranked-bar__value">{value.toLocaleString("pt-BR")}</span>
    </>
  );
  return (
    <button type="button" className="ranked-bar ranked-bar--clickable" onClick={onClick}>
      {content}
    </button>
  );
}

// Donut "Mix por Tipo" — reaproveita as classes de ChannelDonut.jsx
// (channel-card/channel-donut/channel-legend), que são só layout de anel +
// legenda, nada específico de moeda; só o componente em si (que formata
// R$) não servia aqui.
function TypeMixDonut({ items }) {
  const SIZE = 176;
  const STROKE = 26;
  const R = (SIZE - STROKE) / 2;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const CIRC = 2 * Math.PI * R;
  const GAP = 3;

  const total = items.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const segments = items
    .filter((item) => item.value > 0)
    .map((item) => {
      const length = total > 0 ? (item.value / total) * CIRC : 0;
      const seg = { ...item, offset: cursor, length };
      cursor += length;
      return seg;
    });

  return (
    <section className="card channel-card">
      <h2 className="card-title">Mix por Tipo</h2>
      {total === 0 ? (
        <div className="chart-empty">Nenhum chamado no período selecionado.</div>
      ) : (
        <div className="channel-card__body">
          <div className="channel-donut">
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--grid-hairline)" strokeWidth={STROKE} />
              {segments.map((s) => (
                <circle
                  key={s.key}
                  cx={CX}
                  cy={CY}
                  r={R}
                  fill="none"
                  stroke={`var(--${s.color})`}
                  strokeWidth={STROKE}
                  strokeDasharray={`${Math.max(s.length - GAP, 0)} ${CIRC - s.length + GAP}`}
                  strokeDashoffset={-s.offset}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${CX} ${CY})`}
                />
              ))}
            </svg>
            <div className="channel-donut__center">
              <span className="channel-donut__total">{total.toLocaleString("pt-BR")}</span>
              <span className="channel-donut__caption">chamados</span>
            </div>
          </div>
          <ul className="channel-legend">
            {items.map((item) => (
              <li key={item.key} className="channel-legend__item">
                <span className="channel-legend__dot" style={{ background: `var(--${item.color})` }} />
                <span className="channel-legend__name">{item.label}</span>
                <span className="channel-legend__value">{item.value.toLocaleString("pt-BR")}</span>
                <span className="channel-legend__pct">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ConnectFastPage() {
  const [tab, setTab] = useState("visao-geral");
  const [periodId, setPeriodId] = useState("7d");
  const [selectedEntity, setSelectedEntity] = useState(null); // { type: "technician" | "customer", id, label }
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [modalMode, setModalMode] = useState(null); // null | "choose" | "order" | "visit"
  const [linkContext, setLinkContext] = useState(null); // { taskId, taskTypeName, customerName } | null
  const [actionSuccess, setActionSuccess] = useState(null);

  const ranges = useMemo(() => buildRanges(periodId), [periodId]);
  const details = useOperacaoDetails(ranges.current);
  const previousDetails = useOperacaoDetails(ranges.previous);
  const customers = useOperacaoCompletaCustomers(useMemo(() => ({ pageSize: 200, equipmentStatus: "with_equipment" }), []));

  const data = details.data;
  const prevData = previousDetails.data;
  const dailyTypeMetrics = data?.dailyTypeMetrics ?? [];

  function metricByKey(metrics, key) {
    return metrics.find((m) => m.key === key) ?? null;
  }

  const corretivo = metricByKey(dailyTypeMetrics, "chamadoCorretivo");
  const rotina = metricByKey(dailyTypeMetrics, "abastecimentoRotina");
  const prevCorretivo = metricByKey(prevData?.dailyTypeMetrics ?? [], "chamadoCorretivo");

  const atividades = data?.total ?? 0;
  const tecnicosAtivos = data?.byTechnician?.length ?? 0;
  const agendas = rotina?.total ?? 0;
  const corretivosAbertos = corretivo?.open ?? 0;

  const realizados = data?.finished ?? 0;
  const emAberto = Math.max(atividades - realizados, 0);
  const atrasados = (data?.byCustomerSla ?? []).reduce((sum, row) => sum + (row.outsideSla ?? 0), 0);

  const prevAtividades = prevData?.total ?? 0;
  const prevRealizados = prevData?.finished ?? 0;
  const prevEmAberto = Math.max(prevAtividades - prevRealizados, 0);
  const prevAtrasados = (prevData?.byCustomerSla ?? []).reduce((sum, row) => sum + (row.outsideSla ?? 0), 0);
  const prevCorretivosAbertos = prevCorretivo?.open ?? 0;

  const topClientes = useMemo(() => [...(data?.byCustomer ?? [])].sort((a, b) => b.total - a.total).slice(0, 5), [data]);
  const topTecnicos = useMemo(() => [...(data?.byTechnician ?? [])].sort((a, b) => b.total - a.total).slice(0, 5), [data]);
  const maxClienteTotal = Math.max(1, ...topClientes.map((c) => c.total));
  const maxTecnicoTotal = Math.max(1, ...topTecnicos.map((t) => t.total));

  const byTechnicianByRate = useMemo(
    () => [...(data?.byTechnician ?? [])].sort((a, b) => b.completionRate - a.completionRate),
    [data]
  );

  // Chamados "em aberto" por cliente, técnico x operacional — soma
  // dailyTypeMetrics[].byCustomer[].open agrupando pelas categorias reais
  // (ver TECHNICAL_CATEGORY_KEYS/OPERATIONAL_CATEGORY_KEYS acima).
  const openByCustomerId = useMemo(() => {
    const map = new Map();
    for (const metric of data?.dailyTypeMetrics ?? []) {
      const bucket = TECHNICAL_CATEGORY_KEYS.has(metric.key)
        ? "tecnico"
        : OPERATIONAL_CATEGORY_KEYS.has(metric.key)
          ? "operacional"
          : null;
      if (!bucket) continue;
      for (const row of metric.byCustomer ?? []) {
        // Chave sempre normalizada pra string — dailyTypeMetrics/byCustomer
        // e /customers não garantem o mesmo tipo (string vs number) pro
        // mesmo id de cliente da Auvo (ver ClientesComMaquinas.jsx).
        const key = String(row.customerId);
        const entry = map.get(key) ?? { tecnico: 0, operacional: 0 };
        entry[bucket] += row.open ?? 0;
        map.set(key, entry);
      }
    }
    return map;
  }, [data]);

  const donutItems = dailyTypeMetrics.map((metric, i) => ({
    key: metric.key,
    label: metric.label,
    value: metric.total,
    color: DAILY_TYPE_SERIES_COLORS[i % DAILY_TYPE_SERIES_COLORS.length],
  }));

  function refreshAll() {
    details.refetch();
    previousDetails.refetch();
    customers.refetch();
  }

  function handleOpenTaskFromEntity(taskId) {
    setSelectedTaskId(taskId);
  }

  function handleLinkTask(task) {
    setLinkContext({ taskId: task.id, taskTypeName: task.taskTypeName, customerName: task.customerName });
  }

  const anyError = details.error ?? previousDetails.error;

  return (
    <main className="main">
      <header className="topbar">
        <div>
          <h1 className="topbar__title">ConnectFast</h1>
          <p className="topbar__subtitle">
            Painel gerencial de chamados, técnicos e clientes — dado real, direto da Auvo.
          </p>
        </div>
        <div className="topbar__actions">
          {data && (
            <span className="ativos-page__sync">Última atualização: {new Date(data.generatedAt).toLocaleTimeString("pt-BR")}</span>
          )}
          <button type="button" className="btn btn--ghost" onClick={refreshAll}>
            <Icon name="refresh" size={16} />
            Atualizar dados
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setModalMode("choose")}>
            <Icon name="clipboard" size={16} />
            Abrir chamado
          </button>
        </div>
      </header>

      {anyError && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível atualizar os dados do painel.</strong>
            <p>{anyError.message}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={refreshAll}>
            Tentar novamente
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="state-warning-block" style={{ borderColor: "var(--status-good)" }}>
          <strong>{actionSuccess}</strong>
          <button type="button" className="link-btn" onClick={() => setActionSuccess(null)}>
            Fechar
          </button>
        </div>
      )}

      <div className="segmented" style={{ alignSelf: "flex-start" }}>
        <button type="button" className={`segmented__btn ${tab === "visao-geral" ? "is-active" : ""}`} onClick={() => setTab("visao-geral")}>
          Visão Geral
        </button>
        <button type="button" className={`segmented__btn ${tab === "historico" ? "is-active" : ""}`} onClick={() => setTab("historico")}>
          Histórico
        </button>
      </div>

      {tab === "historico" && <HistoricoTab />}

      {tab === "visao-geral" && (
        <>
      <div className="segmented operacao-filters__periods" style={{ alignSelf: "flex-start" }}>
        {PERIODS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`segmented__btn ${periodId === preset.id ? "is-active" : ""}`}
            onClick={() => setPeriodId(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <section className="kpi-grid kpi-grid--connectfast">
        {details.loading || previousDetails.loading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="kpi-card kpi-card--skeleton" />)
          : [
              <GerencialKpi
                key="atividades"
                label="Atividades registradas"
                value={atividades}
                icon="layers"
                accent="series-blue"
                delta={pctDelta(atividades, prevAtividades)}
                polarity="neutral"
              />,
              <GerencialKpi key="tecnicos" label="Técnicos ativos" value={tecnicosAtivos} icon="users" accent="series-aqua" />,
              <GerencialKpi key="agendas" label="Agendas de abastecimento" value={agendas} icon="calendar" accent="series-green" />,
              <GerencialKpi
                key="corretivo"
                label="Corretivos abertos"
                value={corretivosAbertos}
                icon="bolt"
                accent="series-red"
                delta={pctDelta(corretivosAbertos, prevCorretivosAbertos)}
                polarity="goodDown"
              />,
            ]}
      </section>

      <section className="operacao-kpi-grid operacao-kpi-grid--compact">
        {details.loading || previousDetails.loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="stat-tile stat-tile--skeleton" />)
        ) : (
          <>
            <StatTile label="Realizados" value={realizados.toLocaleString("pt-BR")} tone="success" strong />
            <StatTile label="Em aberto" value={emAberto.toLocaleString("pt-BR")} strong />
            <StatTile label="Atrasados (SLA)" value={atrasados.toLocaleString("pt-BR")} tone="danger" strong />
          </>
        )}
      </section>

      <div className="mid-grid">
        <TypeMixDonut items={donutItems} />
        <section className="card">
          <h2 className="card-title">Comparação com o período anterior</h2>
          {details.loading || previousDetails.loading ? (
            <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
          ) : (
            <>
              <p className="ativos-distribution__hint">
                {PERIODS.find((p) => p.id === periodId)?.label} ({ranges.current.dateFrom} a {ranges.current.dateTo})
                vs. período imediatamente anterior de mesma duração ({ranges.previous.dateFrom} a{" "}
                {ranges.previous.dateTo}).
              </p>
              <div className="drawer-field">
                <span className="drawer-field__label">Realizados</span>
                <span className="drawer-field__value">
                  {realizados} <span style={{ color: "var(--text-muted)" }}>({prevRealizados} no período anterior)</span>
                </span>
              </div>
              <div className="drawer-field">
                <span className="drawer-field__label">Em aberto</span>
                <span className="drawer-field__value">
                  {emAberto} <span style={{ color: "var(--text-muted)" }}>({prevEmAberto} no período anterior)</span>
                </span>
              </div>
              <div className="drawer-field">
                <span className="drawer-field__label">Atrasados (SLA)</span>
                <span className="drawer-field__value">
                  {atrasados} <span style={{ color: "var(--text-muted)" }}>({prevAtrasados} no período anterior)</span>
                </span>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="connectfast-rankings">
        <section className="card operacao-breakdown-table">
          <h2 className="card-title">Top Clientes</h2>
          {details.loading ? (
            <div className="skeleton" style={{ height: 160, marginTop: 14 }} />
          ) : topClientes.length === 0 ? (
            <div className="state-empty" style={{ height: 100 }}>
              Nenhum dado para o período selecionado.
            </div>
          ) : (
            <div className="ranked-bar-list">
              {topClientes.map((row) => (
                <RankedBar
                  key={row.key}
                  label={row.label}
                  sublabel={`${row.finished} concluídas`}
                  value={row.total}
                  maxValue={maxClienteTotal}
                  onClick={() => setSelectedEntity({ type: "customer", id: row.key, label: row.label })}
                />
              ))}
            </div>
          )}
        </section>
        <section className="card operacao-breakdown-table">
          <h2 className="card-title">Top Técnicos</h2>
          {details.loading ? (
            <div className="skeleton" style={{ height: 160, marginTop: 14 }} />
          ) : topTecnicos.length === 0 ? (
            <div className="state-empty" style={{ height: 100 }}>
              Nenhum dado para o período selecionado.
            </div>
          ) : (
            <div className="ranked-bar-list">
              {topTecnicos.map((row) => (
                <RankedBar
                  key={row.key}
                  label={row.label}
                  sublabel={`${row.finished} concluídas`}
                  value={row.total}
                  maxValue={maxTecnicoTotal}
                  onClick={() => setSelectedEntity({ type: "technician", id: row.key, label: row.label })}
                />
              ))}
            </div>
          )}
        </section>
      </section>

      <BreakdownTable
        title="Técnicos com atividade no período"
        nameLabel="Técnico"
        rows={byTechnicianByRate}
        loading={details.loading}
        highlightRate
      />

      <ClientesComMaquinas
        customers={customers.items}
        openByCustomerId={openByCustomerId}
        loading={customers.loading || details.loading}
        onSelectCustomer={(id, label) => setSelectedEntity({ type: "customer", id, label })}
      />
        </>
      )}

      {selectedEntity && (
        <EntityDrawer
          entity={selectedEntity}
          rangeParams={ranges.current}
          onClose={() => setSelectedEntity(null)}
          onOpenTask={handleOpenTaskFromEntity}
          onLinkTask={handleLinkTask}
        />
      )}

      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

      {modalMode === "choose" && (
        <OpenTicketChooser
          onClose={() => setModalMode(null)}
          onChooseVisit={() => setModalMode("visit")}
          onChooseOrder={() => setModalMode("order")}
        />
      )}
      {modalMode === "order" && (
        <NewOrderWizard
          onClose={() => setModalMode(null)}
          onCreated={() => {
            setModalMode(null);
            setActionSuccess("Pedido de preparação criado.");
          }}
        />
      )}
      {modalMode === "visit" && (
        <TechnicalVisitModal
          onClose={() => setModalMode(null)}
          onCreated={(result) => {
            setModalMode(null);
            setActionSuccess(`Chamado #${result.ticketId} aberto na Auvo.`);
          }}
        />
      )}

      {linkContext && (
        <TechnicalVisitModal
          onClose={() => setLinkContext(null)}
          initialDescription={`Referente à OS #${linkContext.taskId} (${linkContext.taskTypeName ?? "chamado"} — ${linkContext.customerName ?? "cliente"}).\n\n`}
          onCreated={(result) => {
            setLinkContext(null);
            setActionSuccess(`Chamado #${result.ticketId} aberto, vinculado à OS #${linkContext.taskId}.`);
          }}
        />
      )}
    </main>
  );
}
