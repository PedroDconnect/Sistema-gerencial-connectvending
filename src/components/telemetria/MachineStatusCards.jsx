import { StatTile } from "../ativos/StatTile";
import { SUMMARY_CARDS } from "../../services/vmpayService";

export function MachineStatusCards({ summary, loading }) {
  return (
    <section className="operacao-kpi-grid">
      {loading || !summary
        ? Array.from({ length: SUMMARY_CARDS.length }).map((_, i) => <div key={i} className="stat-tile stat-tile--skeleton" />)
        : SUMMARY_CARDS.map((card) => (
            <StatTile
              key={card.key}
              label={card.label}
              value={(summary[card.key] ?? 0).toLocaleString("pt-BR")}
              tone={card.tone}
            />
          ))}
    </section>
  );
}
