import { Icon } from "./Icon";
import { alerts } from "../data/mockData";

const severityColor = {
  critical: "var(--status-critical)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
};

export function AlertsPanel() {
  return (
    <section className="card alerts-card">
      <div className="alerts-card__header">
        <h2 className="card-title">Alertas</h2>
        <button type="button" className="link-btn">
          Ver todos
        </button>
      </div>
      <ul className="alerts-list">
        {alerts.map((a) => (
          <li key={a.id} className="alerts-list__item">
            <span
              className="alerts-list__icon"
              style={{ color: severityColor[a.severity], background: `color-mix(in srgb, ${severityColor[a.severity]} 16%, transparent)` }}
            >
              <Icon name={a.icon} size={16} />
            </span>
            <div className="alerts-list__body">
              <p className="alerts-list__title">{a.title}</p>
              <p className="alerts-list__desc">{a.description}</p>
              <p className="alerts-list__time">{a.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
