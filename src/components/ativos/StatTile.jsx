export function StatTile({ label, value, tone }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__label">{label}</div>
      <div className={`stat-tile__value num ${tone ? `stat-tile__value--${tone}` : ""}`}>{value}</div>
    </div>
  );
}
