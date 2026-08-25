import { useMemo, useState, useRef, useId } from "react";
import { formatCompactCurrency, formatFullCurrency, formatDeltaPct } from "../lib/format";

const PERIODS = [
  { id: "daily", label: "Diário" },
  { id: "weekly", label: "Semanal" },
  { id: "monthly", label: "Mensal" },
];

const W = 860;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

export function RevenueChart({ daily, weekly, monthly, total, deltaPct }) {
  const [period, setPeriod] = useState("daily");
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);
  const gradientId = useId();

  const points = useMemo(() => {
    if (period === "weekly") return weekly;
    if (period === "monthly") return monthly;
    return daily;
  }, [period, daily, weekly, monthly]);

  const hasData = points && points.length > 1;
  const defaultIndex = hasData ? points.length - 1 : 0;
  const activeIndex = hoverIndex ?? defaultIndex;

  const maxValue = useMemo(() => {
    if (!hasData) return 1;
    const max = Math.max(...points.map((p) => p.value), 1);
    const ceil = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / ceil) * ceil * 1.2;
  }, [points, hasData]);

  const stepX = hasData ? plotW / (points.length - 1) : plotW;
  const coords = hasData
    ? points.map((p, i) => ({
        x: PAD.left + i * stepX,
        y: PAD.top + plotH - (p.value / maxValue) * plotH,
        ...p,
      }))
    : [];

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = hasData
    ? `${linePath} L${coords[coords.length - 1].x},${PAD.top + plotH} L${coords[0].x},${PAD.top + plotH} Z`
    : "";

  const ticks = 5;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = (maxValue / ticks) * i;
    const y = PAD.top + plotH - (value / maxValue) * plotH;
    return { y, label: formatCompactCurrency(value) };
  });

  const active = coords[activeIndex];

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
    <section className="card revenue-card">
      <div className="revenue-card__header">
        <div>
          <h2 className="card-title">Receita Total</h2>
          <div className="revenue-card__headline">
            <span className="revenue-card__value">{formatFullCurrency(total)}</span>
            <span className={`delta ${deltaPct >= 0 ? "delta--up" : "delta--down"}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d={deltaPct >= 0 ? "m3 17 6-6 4 4 8-8M15 6h6v6" : "m3 7 6 6 4-4 8 8M15 17h6v-6"} />
              </svg>
              {formatDeltaPct(deltaPct)}
            </span>
            <span className="revenue-card__caption">vs mês anterior</span>
          </div>
        </div>
        <div className="segmented">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              className={`segmented__btn ${period === p.id ? "is-active" : ""}`}
              onClick={() => {
                setPeriod(p.id);
                setHoverIndex(null);
              }}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="revenue-card__chart">
        {!hasData ? (
          <div className="chart-empty">Sem dados suficientes para este período.</div>
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
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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

            <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
            <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {active && (
              <line
                x1={active.x}
                x2={active.x}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--border-hairline-strong)"
                strokeWidth="1"
              />
            )}
            {active && <circle cx={active.x} cy={active.y} r="4" fill="var(--accent)" stroke="var(--card-bg)" strokeWidth="2" />}

            {coords.map(
              (c, i) =>
                i % Math.ceil(coords.length / 8) === 0 && (
                  <text key={i} x={c.x} y={H - 6} className="chart-axis-label chart-axis-label--x" textAnchor="middle">
                    {c.label}
                  </text>
                )
            )}
          </svg>
        )}

        {active && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(active.x / W) * 100}%`,
              top: `${(active.y / H) * 100}%`,
            }}
          >
            <div className="chart-tooltip__date">{active.label}</div>
            <div className="chart-tooltip__value">{formatFullCurrency(active.value)}</div>
          </div>
        )}
      </div>
    </section>
  );
}
