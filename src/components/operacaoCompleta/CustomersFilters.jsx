import { Icon } from "../Icon";
import { EQUIPMENT_STATUS_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "../../services/operacaoCompletaService";

export function CustomersFilters({ search, onSearchChange, filters, onFilterChange, onClear }) {
  const hasActiveFilters = Boolean(search) || Boolean(filters.status) || Boolean(filters.equipmentStatus);

  return (
    <section className="card ativos-filters">
      <div className="ativos-filters__search">
        <Icon name="search" size={16} />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por cliente ou CNPJ/CPF..."
        />
      </div>

      <div className="operacao-filters__selects operacao-completa-filters__selects">
        <label className="operacao-filters__field">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => onFilterChange("status", e.target.value)}>
            <option value="">Todos</option>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="operacao-filters__field">
          <span>Máquinas</span>
          <select value={filters.equipmentStatus} onChange={(e) => onFilterChange("equipmentStatus", e.target.value)}>
            <option value="">Todos</option>
            {EQUIPMENT_STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ativos-filters__actions">
        <button type="button" className="btn btn--ghost" onClick={onClear} disabled={!hasActiveFilters}>
          Limpar filtros
        </button>
      </div>
    </section>
  );
}
