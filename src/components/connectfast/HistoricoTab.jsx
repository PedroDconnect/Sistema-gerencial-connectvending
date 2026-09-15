import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { StatTile } from "../ativos/StatTile";
import { useConnectFastHistorySummary, useConnectFastHistoryTasks } from "../../hooks/useConnectFastHistory";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { taskStatusLabel, taskStatusBadgeVariant, TASK_STATUS_OPTIONS } from "../../services/operacaoService";

// Mesma ordem fixa de cor categórica do resto do app (ver
// taskTypeCategories.ts/ConnectFastPage.jsx) — aqui aplicada aos tipos
// reais de maior volume no período selecionado, não aos 7 curados.
const SERIES_COLORS = ["series-blue", "series-orange", "series-aqua", "series-yellow", "series-magenta", "series-green", "series-violet"];
const PAGE_SIZE = 50;
// Início real da coleta do data lake (ver datalake/README.md) — não faz
// sentido oferecer um dateFrom anterior a isso, não existe dado lá.
const PIPELINE_START = "2026-07-01";

function fmt(n) {
  return (n || 0).toLocaleString("pt-BR");
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Cópia local do RankedBar já usado em ConnectFastPage.jsx/
// CustomerPanelDetailModal.jsx — mesmo padrão do resto do app (cada tela
// mantém sua própria cópia pequena em vez de importar um componente só
// pra isso).
function RankedBar({ label, sublabel, value, maxValue, color, active, onClick }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <button type="button" className={`ranked-bar ranked-bar--clickable ${active ? "is-active" : ""}`} onClick={onClick}>
      <span className="ranked-bar__label">
        <span className="cat-dot" style={{ background: color }} />
        <span className="ranked-bar__name" title={label}>
          {label}
        </span>
        {sublabel && <span className="ranked-bar__sublabel">{sublabel}</span>}
      </span>
      <span className="ranked-bar__track">
        <span className="ranked-bar__fill" style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%`, background: color }} />
      </span>
      <span className="ranked-bar__value">{fmt(value)}</span>
    </button>
  );
}

export function HistoricoTab() {
  const [dateFrom, setDateFrom] = useState(PIPELINE_START);
  const [dateTo, setDateTo] = useState(todayIso());
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const summaryParams = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const summary = useConnectFastHistorySummary(summaryParams);

  const tasksParams = useMemo(
    () => ({ dateFrom, dateTo, type: typeFilter, status: statusFilter, search: debouncedSearch, page, pageSize: PAGE_SIZE }),
    [dateFrom, dateTo, typeFilter, statusFilter, debouncedSearch, page]
  );
  const tasks = useConnectFastHistoryTasks(tasksParams);

  const days = useMemo(() => Array.from(new Set((summary.data?.rows ?? []).map((r) => r.task_date))).sort(), [summary.data]);
  const typeTotals = useMemo(() => {
    const totals = {};
    (summary.data?.rows ?? []).forEach((r) => { totals[r.task_type_name] = (totals[r.task_type_name] || 0) + r.total; });
    return totals;
  }, [summary.data]);
  const topTypes = useMemo(
    () => Object.entries(typeTotals).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name]) => name),
    [typeTotals]
  );
  const typeColor = useMemo(() => {
    const map = {};
    topTypes.forEach((name, i) => { map[name] = `var(--${SERIES_COLORS[i]})`; });
    return map;
  }, [topTypes]);
  function colorFor(name) {
    return typeColor[name] || "var(--text-faint)";
  }

  const byDayTotal = useMemo(() => {
    const map = {};
    (summary.data?.rows ?? []).forEach((r) => { map[r.task_date] = (map[r.task_date] || 0) + r.total; });
    return days.map((d) => map[d] || 0);
  }, [summary.data, days]);
  const grandTotal = byDayTotal.reduce((a, b) => a + b, 0);
  const maxTypeTotal = Math.max(1, ...topTypes.map((t) => typeTotals[t]));

  function updateFilter(setter) {
    return (value) => { setter(value); setPage(1); };
  }
  const totalPages = Math.max(1, Math.ceil(tasks.total / PAGE_SIZE));

  return (
    <>
      <section className="card operacao-filters">
        <div className="operacao-filters__custom-dates">
          <label className="operacao-filters__field">
            <span>De</span>
            <input type="date" value={dateFrom} min={PIPELINE_START} max={dateTo} onChange={(e) => updateFilter(setDateFrom)(e.target.value)} />
          </label>
          <label className="operacao-filters__field">
            <span>Até</span>
            <input type="date" value={dateTo} min={dateFrom} max={todayIso()} onChange={(e) => updateFilter(setDateTo)(e.target.value)} />
          </label>
        </div>
        <p className="card__hint" style={{ marginTop: 8, marginBottom: 0 }}>
          Histórico coletado desde 01/07/2026 via pipeline Auvo → Backblaze B2 (ver <code>datalake/README.md</code>) —
          sem o limite de 31 dias das outras seções deste painel.
        </p>
      </section>

      {summary.error && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar o histórico.</strong>
            <p>{summary.error.message}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={summary.refetch}>
            Tentar novamente
          </button>
        </div>
      )}

      <section className="operacao-kpi-grid operacao-kpi-grid--compact">
        {summary.loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="stat-tile stat-tile--skeleton" />)
        ) : (
          <>
            <StatTile label="Total no período" value={fmt(grandTotal)} strong />
            <StatTile label="Dias no período" value={fmt(days.length)} strong />
            <StatTile label="Tipos distintos" value={fmt(Object.keys(typeTotals).length)} strong />
          </>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Volume diário</h2>
        <p className="ativos-distribution__hint">Todos os tipos somados, por dia, no período selecionado.</p>
        {summary.loading ? (
          <div className="skeleton" style={{ height: 220, marginTop: 14 }} />
        ) : days.length === 0 ? (
          <div className="chart-empty">Nenhum chamado no período selecionado.</div>
        ) : (
          <VolumeChart days={days} values={byDayTotal} />
        )}
      </section>

      <section className="card operacao-breakdown-table">
        <h2 className="card-title">Top tipos de chamado</h2>
        <p className="ativos-distribution__hint">Clique num tipo para filtrar a auditoria abaixo só por ele.</p>
        {summary.loading ? (
          <div className="skeleton" style={{ height: 160, marginTop: 14 }} />
        ) : (
          <div className="ranked-bar-list">
            {topTypes.map((name) => (
              <RankedBar
                key={name}
                label={name}
                value={typeTotals[name]}
                maxValue={maxTypeTotal}
                color={colorFor(name)}
                active={typeFilter === name}
                onClick={() => updateFilter(setTypeFilter)(typeFilter === name ? "" : name)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card operacao-breakdown-table">
        <h2 className="card-title">Auditoria por O.S.</h2>
        <div className="operacao-filters__selects" style={{ marginBottom: 14 }}>
          <input
            className="form-field__input"
            placeholder="Buscar por O.S., cliente ou técnico…"
            value={search}
            onChange={(e) => updateFilter(setSearch)(e.target.value)}
          />
          <select className="form-field__input" value={statusFilter} onChange={(e) => updateFilter(setStatusFilter)(e.target.value)}>
            <option value="">Todos os status</option>
            {TASK_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {typeFilter && (
            <button type="button" className="btn btn--ghost" onClick={() => updateFilter(setTypeFilter)("")}>
              <Icon name="close" size={13} />
              Tipo: {typeFilter}
            </button>
          )}
        </div>

        {tasks.loading ? (
          <div className="skeleton" style={{ height: 260 }} />
        ) : tasks.items.length === 0 ? (
          <div className="state-empty">
            <p>
              <strong>Nenhuma O.S. encontrada.</strong>
              <br />
              Tente ajustar os filtros ou o período.
            </p>
          </div>
        ) : (
          <>
            <div className="ativos-table-wrap">
              <table className="data-table ativos-table">
                <thead>
                  <tr>
                    <th className="num">O.S.</th>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Cliente</th>
                    <th>Técnico</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.items.map((row) => (
                    <tr key={row.auvo_task_id}>
                      <td className="num">{row.auvo_task_id}</td>
                      <td className="num">{row.task_date}</td>
                      <td className="ativos-table__truncate" title={row.task_type_name}>
                        <span className="cat-dot" style={{ background: colorFor(row.task_type_name) }} />
                        {row.task_type_name}
                      </td>
                      <td className="ativos-table__truncate" title={row.customer_name}>
                        {row.customer_name || <span className="ativos-table__muted">Sem cliente</span>}
                      </td>
                      <td className="ativos-table__truncate" title={row.technician_name}>
                        {row.technician_name || "—"}
                      </td>
                      <td>
                        <span className={`badge badge--${taskStatusBadgeVariant(row.status)}`}>{taskStatusLabel(row.status)}</span>
                      </td>
                      <td>
                        {row.task_url ? (
                          <a className="link-btn" href={row.task_url} target="_blank" rel="noopener noreferrer">
                            Auditar na Auvo ↗
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ativos-pagination">
              <span className="ativos-pagination__label">{fmt(tasks.total)} O.S. encontradas</span>
              <div className="ativos-pagination__nav">
                <button type="button" className="btn btn--secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </button>
                <span className="ativos-pagination__page">
                  Página {page} de {totalPages}
                </span>
                <button type="button" className="btn btn--secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}

function VolumeChart({ days, values }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const w = 960, h = 220, padL = 8, padR = 8, padT = 12, padB = 26;
  const n = days.length;
  const maxV = Math.max(10, Math.ceil((Math.max(...values) * 1.1) / 10) * 10);
  const x = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const y = (v) => padT + (1 - v / maxV) * (h - padT - padB);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${h - padB} L${x(0).toFixed(1)},${h - padB} Z`;
  const labelEvery = n > 60 ? 7 : n > 20 ? 3 : 1;
  const slot = (w - padL - padR) / n;

  return (
    <div className="chart-wrap" style={{ position: "relative", marginTop: 14 }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0, 1, 2, 3, 4].map((g) => {
          const gy = padT + (g / 4) * (h - padT - padB);
          return (
            <g key={g}>
              <line x1={padL} y1={gy} x2={w - padR} y2={gy} stroke="var(--grid-hairline)" strokeWidth="1" />
              <text x={4} y={gy + 3} fontSize="9.5" fill="var(--axis-muted)">
                {fmt(Math.round(maxV - (g / 4) * maxV))}
              </text>
            </g>
          );
        })}
        <path d={area} fill="var(--accent)" opacity="0.14" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hoverIdx !== null && (
          <>
            <line x1={x(hoverIdx)} y1={padT} x2={x(hoverIdx)} y2={h - padB} stroke="var(--border-hairline-strong)" strokeWidth="1" />
            <circle cx={x(hoverIdx)} cy={y(values[hoverIdx])} r="4" fill="var(--accent)" />
          </>
        )}
        {Array.from({ length: n }, (_, i) => i)
          .filter((i) => i % labelEvery === 0)
          .map((i) => (
            <text key={i} x={x(i)} y={h - 8} fontSize="9.5" fill="var(--axis-muted)" textAnchor="middle">
              {days[i].slice(8, 10)}/{days[i].slice(5, 7)}
            </text>
          ))}
        {values.map((_, i) => (
          <rect
            key={i}
            x={x(i) - slot / 2}
            y={0}
            width={slot}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
      </svg>
      {hoverIdx !== null && (
        <div
          className="tooltip"
          style={{
            position: "absolute",
            left: `${(x(hoverIdx) / w) * 100}%`,
            top: Math.max((y(values[hoverIdx]) / h) * 100 - 22, 0) + "%",
            transform: "translate(-50%, -100%)",
            background: "var(--text-primary)",
            color: "var(--page-bg)",
            fontSize: 11.5,
            padding: "6px 9px",
            borderRadius: 8,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {days[hoverIdx]}: <strong>{fmt(values[hoverIdx])}</strong>
        </div>
      )}
    </div>
  );
}
