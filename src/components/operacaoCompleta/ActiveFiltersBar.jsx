import { Icon } from "../Icon";

function Chip({ label, onRemove }) {
  return (
    <span className="filter-chip">
      {label}
      <button type="button" className="filter-chip__remove" onClick={onRemove} aria-label={`Remover filtro ${label}`}>
        <Icon name="close" size={11} />
      </button>
    </span>
  );
}

// Resumo visual do que está filtrando a tela — mapa e tabela de máquinas
// usam o mesmo estado de filtros, mas o mapa fica visível mesmo na aba
// "Clientes" (onde os controles de filtro somem); esta barra garante que
// sempre dá pra ver o que está sendo aplicado, em qualquer aba, sem
// precisar voltar pra aba "Máquinas" pra conferir.
export function ActiveFiltersBar({ search, filters, onRemoveSearch, onRemoveValue, onClearStatus, onClearLinkStatus, onClearAll }) {
  const chips = [];

  if (search) chips.push({ key: "search", label: `Busca: "${search}"`, onRemove: onRemoveSearch });
  if (filters.status) {
    chips.push({
      key: "status",
      label: `Status: ${filters.status === "active" ? "Ativo" : "Inativo"}`,
      onRemove: onClearStatus,
    });
  }
  if (filters.linkStatus) {
    chips.push({
      key: "linkStatus",
      label: `Vínculo: ${filters.linkStatus === "with_customer" ? "Com cliente" : "Sem cliente"}`,
      onRemove: onClearLinkStatus,
    });
  }
  filters.models.forEach((value) => chips.push({ key: `model-${value}`, label: `Modelo: ${value}`, onRemove: () => onRemoveValue("models", value) }));
  filters.customers.forEach((value) =>
    chips.push({ key: `customer-${value}`, label: `Cliente: ${value}`, onRemove: () => onRemoveValue("customers", value) })
  );
  filters.states.forEach((value) => chips.push({ key: `state-${value}`, label: `Estado: ${value}`, onRemove: () => onRemoveValue("states", value) }));

  if (chips.length === 0) return null;

  return (
    <div className="filter-chips-bar">
      <span className="filter-chips-bar__label">Filtros ativos:</span>
      <div className="filter-chips-bar__list">
        {chips.map((chip) => (
          <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
        ))}
      </div>
      <button type="button" className="link-btn filter-chips-bar__clear" onClick={onClearAll}>
        Limpar tudo
      </button>
    </div>
  );
}
