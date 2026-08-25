// Camada de normalização e apresentação dos ativos vindos do Protheus (WS_ATIVOS).
// Os nomes técnicos ativo_* ficam isolados aqui — o resto do app só conhece os
// campos normalizados abaixo e os rótulos de ATIVO_FIELD_LABELS.

export const ATIVO_FIELD_LABELS = {
  filial: "Filial",
  codigo: "Código do Ativo",
  modelo: "Modelo",
  produtoCodigo: "Código do Produto",
  produtoDescricao: "Descrição do Produto",
  numeroSerie: "Número de Série",
  pontoVenda: "Ponto de Venda",
  clienteCnpj: "CNPJ do Cliente",
  clienteCodigo: "Código do Cliente",
  clienteLoja: "Loja",
  clienteNome: "Cliente",
};

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

function trim(value) {
  return typeof value === "string" ? value.trim() : value ?? "";
}

// O Protheus não expõe um ID único por ativo — filial+código+série pode se
// repetir entre registros (mesma máquina física listada para clientes/pontos
// diferentes, ou duplicidade real na origem). Sem um id garantidamente único,
// o React reconcilia a lista errado ao filtrar/ordenar e deixa linhas "fantasma"
// na tela. Por isso o índice do array entra na chave — só para essa finalidade
// de renderização, nunca como identificador de negócio.
export function normalizeAtivo(raw, index = 0) {
  return {
    id: `${index}-${trim(raw.ativo_filial)}-${trim(raw.ativo_codigo)}-${trim(raw.ativo_numserie)}`,
    filial: trim(raw.ativo_filial),
    codigo: trim(raw.ativo_codigo),
    modelo: trim(raw.ativo_modelo),
    produtoCodigo: trim(raw.ativo_produto),
    produtoDescricao: trim(raw.ativo_prod_desc),
    numeroSerie: trim(raw.ativo_numserie),
    pontoVenda: trim(raw.ativo_pontov),
    clienteCnpj: trim(raw.ativo_cli_cgc),
    clienteCodigo: trim(raw.ativo_cli_cod),
    clienteLoja: trim(raw.ativo_cli_loja),
    clienteNome: trim(raw.ativo_cli_nome),
  };
}

export function normalizeAtivos(rawList) {
  return Array.isArray(rawList) ? rawList.map((raw, index) => normalizeAtivo(raw, index)) : [];
}

function onlyDigits(value) {
  return (value ?? "").toString().replace(/\D/g, "");
}

export function formatCnpj(raw) {
  const digits = onlyDigits(raw);
  if (digits.length !== 14) return trim(raw);
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export function distinctSorted(list, key) {
  const values = new Set();
  list.forEach((item) => {
    const value = item[key];
    if (value) values.add(value);
  });
  return Array.from(values).sort((a, b) => collator.compare(a, b));
}

export function computeAtivosStats(list) {
  return {
    total: list.length,
    modelos: distinctSorted(list, "modelo").length,
    clientes: distinctSorted(list, "clienteNome").length,
    pontosVenda: distinctSorted(list, "pontoVenda").length,
    filiais: distinctSorted(list, "filial").length,
  };
}

function normalizeSearchTerm(value) {
  return trim(value).toLowerCase();
}

const SEARCHABLE_FIELDS = [
  "codigo",
  "modelo",
  "numeroSerie",
  "produtoCodigo",
  "produtoDescricao",
  "pontoVenda",
  "clienteNome",
  "clienteCodigo",
];

export function filterAtivos(list, filters = {}) {
  const { search, modelo = [], clienteNome = [], filial = [], pontoVenda = [], clienteLoja = [] } = filters;
  const term = normalizeSearchTerm(search);

  return list.filter((item) => {
    if (modelo.length && !modelo.includes(item.modelo)) return false;
    if (clienteNome.length && !clienteNome.includes(item.clienteNome)) return false;
    if (filial.length && !filial.includes(item.filial)) return false;
    if (pontoVenda.length && !pontoVenda.includes(item.pontoVenda)) return false;
    if (clienteLoja.length && !clienteLoja.includes(item.clienteLoja)) return false;
    if (!term) return true;

    return SEARCHABLE_FIELDS.some((field) => item[field].toLowerCase().includes(term));
  });
}

export function sortAtivos(list, sortKey, direction = "asc") {
  if (!sortKey) return list;
  const sorted = [...list].sort((a, b) => collator.compare(a[sortKey] ?? "", b[sortKey] ?? ""));
  return direction === "desc" ? sorted.reverse() : sorted;
}

export function groupBy(list, field, { emptyLabel = "Não informado" } = {}) {
  const groups = new Map();
  list.forEach((item) => {
    const key = item[field] || emptyLabel;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const total = list.length || 1;
  return Array.from(groups.entries())
    .map(([label, items]) => ({
      label,
      items,
      count: items.length,
      pct: Math.round((items.length / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);
}

const EXPORT_COLUMNS = [
  ["modelo", "Modelo"],
  ["codigo", "Código do Ativo"],
  ["numeroSerie", "Número de Série"],
  ["clienteNome", "Cliente"],
  ["clienteCodigo", "Código do Cliente"],
  ["clienteCnpj", "CNPJ do Cliente"],
  ["pontoVenda", "Ponto de Venda"],
  ["clienteLoja", "Loja"],
  ["filial", "Filial"],
  ["produtoCodigo", "Código do Produto"],
  ["produtoDescricao", "Descrição do Produto"],
];

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function ativosToCsv(list) {
  const header = EXPORT_COLUMNS.map(([, label]) => csvEscape(label)).join(";");
  const rows = list.map((item) =>
    EXPORT_COLUMNS.map(([key]) => csvEscape(key === "clienteCnpj" ? formatCnpj(item[key]) : item[key])).join(";")
  );
  return [header, ...rows].join("\r\n");
}

export function formatSyncTime(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  const now = new Date();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) return `Hoje, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Ontem, ${time}`;

  return `${date.toLocaleDateString("pt-BR")}, ${time}`;
}

export function downloadCsv(filename, csvContent) {
  const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
