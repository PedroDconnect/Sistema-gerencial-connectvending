// Função única e centralizada de normalização de patrimônio — usada tanto
// pelo registry (Auvo × VMpay) quanto pelo sync de vendas (indexar por
// patrimônio normalizado). "627", "00627", "000627", " 627 " precisam
// comparar iguais; nunca sobrescreve o valor original (quem usa isso
// guarda original + normalized lado a lado, nunca só o normalizado).
export function normalizePatrimony(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Remove zeros à esquerda só quando o valor é puramente numérico — um
  // identifier alfanumérico ("PHEDRA-01") não deve ter dígitos "comidos".
  const upper = trimmed.toUpperCase();
  if (/^\d+$/.test(upper)) {
    const stripped = upper.replace(/^0+/, "");
    return stripped || "0";
  }
  return upper;
}
