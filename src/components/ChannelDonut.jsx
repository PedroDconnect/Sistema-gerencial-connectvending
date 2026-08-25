import { useState } from "react";
import { formatCompactCurrency } from "../lib/format";

const SIZE = 176;
const STROKE = 26;
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CIRC = 2 * Math.PI * R;
const GAP = 3; // surface gap between adjacent donut segments

export function ChannelDonut({ channels, total }) {
  const [activeId, setActiveId] = useState(null);
  const hasData = channels && channels.length > 0;

  let cursor = 0;
  const segments = hasData
    ? channels.map((d) => {
        const length = (d.pct / 100) * CIRC;
        const seg = { ...d, offset: cursor, length };
        cursor += length;
        return seg;
      })
    : [];

  return (
    <section className="card channel-card">
      <h2 className="card-title">Receita por Canal</h2>
      {!hasData ? (
        <div className="chart-empty">Sem vendas fechadas neste período.</div>
      ) : (
        <div className="channel-card__body">
          <div className="channel-donut">
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--grid-hairline)" strokeWidth={STROKE} />
              {segments.map((s) => {
                const isActive = activeId === s.id;
                const dim = activeId && !isActive;
                return (
                  <circle
                    key={s.id}
                    cx={CX}
                    cy={CY}
                    r={R}
                    fill="none"
                    stroke={`var(--series-${s.color})`}
                    strokeWidth={STROKE}
                    strokeDasharray={`${Math.max(s.length - GAP, 0)} ${CIRC - s.length + GAP}`}
                    strokeDashoffset={-s.offset}
                    strokeLinecap="butt"
                    transform={`rotate(-90 ${CX} ${CY})`}
                    opacity={dim ? 0.35 : 1}
                    onMouseEnter={() => setActiveId(s.id)}
                    onMouseLeave={() => setActiveId(null)}
                    tabIndex={0}
                    role="img"
                    aria-label={`${s.name}: ${formatCompactCurrency(s.value)}, ${s.pct}%`}
                    style={{ cursor: "pointer", transition: "opacity 120ms ease" }}
                  />
                );
              })}
            </svg>
            <div className="channel-donut__center">
              <span className="channel-donut__total">{formatCompactCurrency(total)}</span>
              <span className="channel-donut__caption">Total</span>
            </div>
          </div>

          <ul className="channel-legend">
            {channels.map((d) => (
              <li
                key={d.id}
                className={`channel-legend__item ${activeId && activeId !== d.id ? "is-dim" : ""}`}
                onMouseEnter={() => setActiveId(d.id)}
                onMouseLeave={() => setActiveId(null)}
              >
                <span className="channel-legend__dot" style={{ background: `var(--series-${d.color})` }} />
                <span className="channel-legend__name">{d.name}</span>
                <span className="channel-legend__value">{formatCompactCurrency(d.value)}</span>
                <span className="channel-legend__pct">{d.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
