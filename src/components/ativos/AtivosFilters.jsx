import { Icon } from "../Icon";
import { MultiSelect } from "./MultiSelect";
import { ATIVO_FIELD_LABELS } from "../../services/ativosService";

const SELECT_FIELDS = [
  { key: "modelo", label: ATIVO_FIELD_LABELS.modelo, optionsKey: "modelos" },
  { key: "clienteNome", label: ATIVO_FIELD_LABELS.clienteNome, optionsKey: "clientes" },
  { key: "filial", label: ATIVO_FIELD_LABELS.filial, optionsKey: "filiais" },
  { key: "pontoVenda", label: ATIVO_FIELD_LABELS.pontoVenda, optionsKey: "pontosVenda" },
  { key: "clienteLoja", label: ATIVO_FIELD_LABELS.clienteLoja, optionsKey: "lojas" },
];

export function AtivosFilters({ search, onSearchChange, filters, onFilterChange, onClear, options }) {
  const hasActiveFilters = Boolean(search) || SELECT_FIELDS.some((f) => filters[f.key]?.length > 0);

  return (
    <section className="card ativos-filters">
      <div className="ativos-filters__search">
        <Icon name="search" size={16} />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por máquina, modelo, série ou cliente..."
        />
      </div>

      <div className="ativos-filters__selects">
        {SELECT_FIELDS.map((field) => (
          <MultiSelect
            key={field.key}
            label={field.label}
            options={options[field.optionsKey] ?? []}
            selected={filters[field.key] ?? []}
            onChange={(values) => onFilterChange(field.key, values)}
          />
        ))}
      </div>

      <div className="ativos-filters__actions">
        <button type="button" className="btn btn--ghost" onClick={onClear} disabled={!hasActiveFilters}>
          Limpar filtros
        </button>
      </div>
    </section>
  );
}
