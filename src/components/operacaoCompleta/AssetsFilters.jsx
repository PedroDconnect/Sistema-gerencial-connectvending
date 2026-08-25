import { Icon } from "../Icon";
import { MultiSelect } from "../ativos/MultiSelect";
import { LINK_STATUS_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "../../services/operacaoCompletaService";

export function AssetsFilters({ search, onSearchChange, filters, onFilterChange, onClear, options }) {
  const hasActiveFilters =
    Boolean(search) ||
    Boolean(filters.status) ||
    Boolean(filters.linkStatus) ||
    filters.models.length > 0 ||
    filters.customers.length > 0 ||
    filters.states.length > 0;

  return (
    <section className="card ativos-filters">
      <div className="ativos-filters__search">
        <Icon name="search" size={16} />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por máquina, identifier ou cliente..."
        />
      </div>

      <div className="operacao-completa-filters__selects">
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
          <span>Situação de vínculo</span>
          <select value={filters.linkStatus} onChange={(e) => onFilterChange("linkStatus", e.target.value)}>
            <option value="">Todos</option>
            {LINK_STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <MultiSelect
          label="Modelo"
          options={options.models}
          selected={filters.models}
          onChange={(values) => onFilterChange("models", values)}
        />

        <MultiSelect
          label="Cliente"
          options={options.customers}
          selected={filters.customers}
          onChange={(values) => onFilterChange("customers", values)}
        />

        <MultiSelect
          label="Estado"
          options={options.states}
          selected={filters.states}
          onChange={(values) => onFilterChange("states", values)}
        />
      </div>

      <div className="ativos-filters__actions">
        <button type="button" className="btn btn--ghost" onClick={onClear} disabled={!hasActiveFilters}>
          Limpar filtros
        </button>
      </div>
    </section>
  );
}
