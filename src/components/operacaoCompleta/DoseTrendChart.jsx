import { useMemo, useRef, useState } from "react";
import { formatDayOnly, formatDayShort } from "../../services/operacaoCompletaService";

const W = 820;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 26, left: 40 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

function addOneDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

// A API só devolve dias com venda (dia sem nenhuma venda simplesmente não
// aparece em byDay) — sem preencher os buracos com zero, o gráfico
// desenharia dias sem venda como se fossem consecutivos ao anterior,
// distorcendo o eixo X (ex.: um fim de semana vazio "some" e o traço liga
// sexta direto na segunda). Preenche todo o período pedido, dia a dia.
function buildDenseSeries(byDay, startDate, endDate) {
  if (!startDate || !endDate) return byDay ?? [];
  const byDate = new Map((byDay ?? []).map((d) => [d.date, d]));
  const days = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < 400) {
    const found = byDate.get(cursor);
    days.push({ date: cursor, quantity: found?.quantity ?? 0, salesCount: found?.salesCount ?? 0 });
    cursor = addOneDay(cursor);
    guard += 1;
  }
  return days;
}

export function DoseTrendChart({ byDay, startDate, endDate }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  const points = useMemo(() => buildDenseSeries(byDay, startDate, endDate), [byDay, startDate, endDate]);
  const hasData = points.length > 1;
  const defaultIndex = hasData ? points.length - 1 : 0;
  const activeIndex = hoverIndex ?? defaultIndex;

  const maxValue = useMemo(() => {
    if (!hasData) return 1;
    const max = Math.max(...points.map((p) => p.quantity), 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / magnitude) * magnitude * 1.2 || max * 1.2;
  }, [points, hasData]);

  const stepX = hasData ? plotW / (points.length - 1) : plotW;
  const coords = hasData
    ? points.map((p, i) => ({
        x: PAD.left + i * stepX,
        y: PAD.top + plotH - (p.quantity / maxValue) * plotH,
        ...p,
      }))
    : [];

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = hasData
    ? `${linePath} L${coords[coords.length - 1].x},${PAD.top + plotH} L${coords[0].x},${PAD.top + plotH} Z`
    : "";

  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = (maxValue / ticks) * i;
    const y = PAD.top + plotH - (value / maxValue) * plotH;
    return { y, label: Math.round(value).toLocaleString("pt-BR") };
  });

  const active = coords[activeIndex];
  const xLabelEvery = Math.max(1, Math.ceil(coords.length / 8));

  function handleMove(e) {
    if (!hasData) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="dose-trend-chart">
      {!hasData ? (
        <div className="chart-empty">Sem dados suficientes para exibir o gráfico.</div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="revenue-svg"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="doseTrendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map((g, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={g.y} y2={g.y} stroke="var(--grid-hairline)" strokeWidth="1" />
              <text x={0} y={g.y} dy="3" className="chart-axis-label">
                {g.label}
              </text>
            </g>
          ))}

          <path d={areaPath} fill="url(#doseTrendGradient)" stroke="none" />
          <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {active && (
            <line x1={active.x} x2={active.x} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--border-hairline-strong)" strokeWidth="1" />
          )}
          {active && <circle cx={active.x} cy={active.y} r="4" fill="var(--accent)" stroke="var(--card-bg)" strokeWidth="2" />}

          {coords.map(
            (c, i) =>
              i % xLabelEvery === 0 && (
                <text key={i} x={c.x} y={H - 6} className="chart-axis-label chart-axis-label--x" textAnchor="middle">
                  {formatDayShort(c.date)}
                </text>
              )
          )}
        </svg>
      )}

      {active && hasData && (
        <div className="chart-tooltip" style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}>
          <div className="chart-tooltip__date">{formatDayOnly(active.date)}</div>
          <div className="chart-tooltip__value">{active.quantity.toLocaleString("pt-BR")} doses</div>
          <div className="chart-tooltip__sub">{active.salesCount.toLocaleString("pt-BR")} vendas</div>
        </div>
      )}
    </div>
  );
}
