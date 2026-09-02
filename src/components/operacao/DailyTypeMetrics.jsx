import { useState } from "react";
import { Icon } from "../Icon";
import { DailyTypeMetricModal } from "./DailyTypeMetricModal";
import { sharePercent } from "../../services/operacaoService";

export function DailyTypeMetrics({ metrics, loading, baseParams, customerTypeRows = [], customerTypeCategories = [] }) {
  const [openKey, setOpenKey] = useState(null);
  const openMetric = metrics.find((m) => m.key === openKey) ?? null;

  return (
    <section className="card operacao-daily-metrics">
      <h2 className="card-title">Métricas do Dia</h2>
      <p className="ativos-distribution__hint">
        Total de chamados por tipo no período selecionado, em aberto x finalizado. Clique em "Visualizar" para
        detalhar por cliente e abrir a O.S. na Auvo, sem sair de onde você está.
      </p>

      <div className="operacao-daily-metrics__grid">
        {loading
          ? Array.from({ length: 7 }).map((_, i) => <div key={i} className="stat-tile stat-tile--skeleton" />)
          : metrics.map((metric) => (
              <article key={metric.key} className="operacao-metric-card">
                <span className="operacao-metric-card__label" title={metric.label}>
                  {metric.label}
                </span>
                <strong className="operacao-metric-card__value num">{metric.total.toLocaleString("pt-BR")}</strong>
                <div className="operacao-metric-card__split">
                  <span>
                    Em aberto{" "}
                    <strong className={metric.open > 0 ? "operacao-value--danger" : ""}>
                      {metric.open.toLocaleString("pt-BR")}
                    </strong>{" "}
                    <span className="operacao-metric-card__pct">({sharePercent(metric.open, metric.total)}%)</span>
                  </span>
                  <span>
                    Finalizado{" "}
                    <strong className={metric.finished > 0 ? "operacao-value--success" : ""}>
                      {metric.finished.toLocaleString("pt-BR")}
                    </strong>{" "}
                    <span className="operacao-metric-card__pct">({sharePercent(metric.finished, metric.total)}%)</span>
                  </span>
                </div>
                <button type="button" className="operacao-metric-card__action" onClick={() => setOpenKey(metric.key)}>
                  <Icon name="eye" size={14} />
                  Visualizar
                </button>
              </article>
            ))}
      </div>

      {openMetric && (
        <DailyTypeMetricModal
          metric={openMetric}
          baseParams={baseParams}
          customerTypeRows={customerTypeRows}
          customerTypeCategories={customerTypeCategories}
          onClose={() => setOpenKey(null)}
        />
      )}
    </section>
  );
}
