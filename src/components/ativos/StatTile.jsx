// "strong" liga o cartão inteiro (fundo + borda) na cor do tom, não só o
// número — pra KPI que precisa ser lido de longe (modo apresentação).
// Opt-in de propósito: sem isso, todo StatTile existente (Ativos,
// Telemetria, Operação Completa) continua exatamente como já era.
export function StatTile({ label, value, tone, strong = false }) {
  const className = ["stat-tile", strong && tone ? `stat-tile--${tone}` : ""].filter(Boolean).join(" ");
  const valueClassName = ["stat-tile__value", "num", tone ? `stat-tile__value--${tone}` : ""].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <div className="stat-tile__label">{label}</div>
      <div className={valueClassName}>{value}</div>
    </div>
  );
}
