export function formatCompactCurrency(v) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (v >= 1_000) return `R$ ${Math.round(v / 1000)}K`;
  return `R$ ${Math.round(v)}`;
}

export function formatFullCurrency(v) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDeltaPct(pct) {
  const sign = pct >= 0 ? "" : "-";
  return `${sign}${Math.abs(pct).toFixed(1).replace(".", ",")}%`;
}
