// "Planejado" = total de tarefas com data no período consultado.
// "Executado" = tarefas com finished=true. São os dois únicos números que
// existem de fato nos dados da Auvo — nenhuma meta ou capacidade é
// inventada aqui.
export function PerformanceChart({ total, finished, loading }) {
  const max = Math.max(total, finished, 1);
  const plannedPct = Math.round((total / max) * 100);
  const executedPct = Math.round((finished / max) * 100);

  return (
    <section className="card operacao-performance">
      <h2 className="card-title">Desempenho Operacional</h2>

      {loading ? (
        <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
      ) : (
        <div className="operacao-performance__bars">
          <div className="operacao-performance__row">
            <span className="operacao-performance__label">Planejado</span>
            <span className="ativos-distribution__track operacao-performance__track">
              <span className="ativos-distribution__fill" style={{ width: `${plannedPct}%` }} />
            </span>
            <span className="operacao-performance__value num">{total.toLocaleString("pt-BR")}</span>
          </div>
          <div className="operacao-performance__row">
            <span className="operacao-performance__label">Executado</span>
            <span className="ativos-distribution__track operacao-performance__track">
              <span
                className="ativos-distribution__fill ativos-distribution__fill--sub"
                style={{ width: `${executedPct}%` }}
              />
            </span>
            <span className="operacao-performance__value num">{finished.toLocaleString("pt-BR")}</span>
          </div>
        </div>
      )}
    </section>
  );
}
