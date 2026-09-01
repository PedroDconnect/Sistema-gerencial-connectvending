// Simplificado a pedido: o que importa pro gerente é só "terminou ou não"
// — os status intermediários da Auvo (em deslocamento, em atendimento,
// check-out realizado, pausada) todos viram "Em aberto" aqui, mesmo
// princípio já usado em taskStatusBadgeVariant (só Finalizada é verde).
export function StatusBreakdown({ summary, loading }) {
  const total = summary?.total ?? 0;
  const finished = summary?.finished ?? 0;
  const open = Math.max(total - finished, 0);

  const rows = [
    { key: "finished", label: "Finalizada", count: finished, variant: "success" },
    { key: "open", label: "Em aberto", count: open, variant: "danger" },
  ];

  return (
    <section className="card operacao-status-breakdown">
      <h2 className="card-title">Status da Operação</h2>

      {loading ? (
        <div className="skeleton" style={{ height: 80, marginTop: 14 }} />
      ) : (
        <ul className="operacao-status-breakdown__list">
          {rows.map(({ key, label, count, variant }) => {
            const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
            const valueClass = variant === "success" ? "operacao-value--success" : "operacao-value--danger";
            return (
              <li key={key} className="operacao-status-breakdown__row">
                <span className={`operacao-status-breakdown__name ${valueClass}`}>{label}</span>
                <span className="ativos-distribution__track">
                  <span className={`ativos-distribution__fill ativos-distribution__fill--${variant}`} style={{ width: `${pct}%` }} />
                </span>
                <span className={`ativos-distribution__count num ${valueClass}`}>{count.toLocaleString("pt-BR")}</span>
                <span className="ativos-distribution__pct num">{pct}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
