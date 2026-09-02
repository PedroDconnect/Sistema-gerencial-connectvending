import { Icon } from "./Icon";
import { Sparkline } from "./Sparkline";

export function KpiCard({ label, value, delta, direction, icon, accent, sparkline, mock, deltaCaption = "vs mês anterior" }) {
  const color = `var(--series-${accent})`;
  return (
    <article className="kpi-card">
      <div className="kpi-card__top">
        <span className="kpi-card__label">
          {label}
          {mock && <span className="kpi-card__mock-tag" title="Ainda sem fonte de dados real">simulado</span>}
        </span>
        <span className="kpi-card__icon" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          <Icon name={icon} size={20} />
        </span>
      </div>
      <div className="kpi-card__value">{value}</div>
      <div className="kpi-card__bottom">
        <div className={`kpi-card__delta kpi-card__delta--${direction}`}>
          <Icon name={direction === "up" ? "trendUp" : "trendDown"} size={13} strokeWidth={2.2} />
          <span>{delta}</span>
          <span className="kpi-card__delta-caption">{deltaCaption}</span>
        </div>
        <Sparkline data={sparkline} color={color} />
      </div>
    </article>
  );
}
