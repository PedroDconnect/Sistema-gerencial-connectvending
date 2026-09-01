import { PERIOD_PRESETS, TASK_STATUS_OPTIONS, SLA_FILTER_OPTIONS } from "../../services/operacaoService";

export function OperacaoFilters({ filters, onChange, onClear, technicianOptions, customerOptions, typeOptions, scope }) {
  // Abastecimento Rotina é só 1 tipo (não passa por SLA — ver isSlaEligible
  // no backend) — mostrar os dois seletores ali seria filtro sem efeito.
  const showTypeFilter = scope !== "rotina";
  const showSlaFilter = scope !== "rotina";

  const hasActiveFilters =
    filters.period !== "today" ||
    filters.status ||
    filters.technician ||
    filters.customer ||
    (showTypeFilter && filters.type) ||
    (showSlaFilter && filters.sla);

  return (
    <section className="card operacao-filters">
      <div className="operacao-filters__top">
        <div className="segmented operacao-filters__periods">
          {PERIOD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`segmented__btn ${filters.period === preset.id ? "is-active" : ""}`}
              onClick={() => onChange("period", preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {showSlaFilter && (
          <label className="operacao-filters__field operacao-filters__field--sla">
            <span>SLA</span>
            <select value={filters.sla} onChange={(e) => onChange("sla", e.target.value)}>
              <option value="">Todos os chamados</option>
              {SLA_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {filters.period === "custom" && (
        <div className="operacao-filters__custom-dates">
          <label className="operacao-filters__field">
            <span>De</span>
            <input type="date" value={filters.dateFrom} onChange={(e) => onChange("dateFrom", e.target.value)} />
          </label>
          <label className="operacao-filters__field">
            <span>Até</span>
            <input type="date" value={filters.dateTo} onChange={(e) => onChange("dateTo", e.target.value)} />
          </label>
        </div>
      )}

      <div className="operacao-filters__selects">
        <label className="operacao-filters__field">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => onChange("status", e.target.value)}>
            <option value="">Todos</option>
            {TASK_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {showTypeFilter && (
          <label className="operacao-filters__field">
            <span>Tipo de operação</span>
            <select value={filters.type} onChange={(e) => onChange("type", e.target.value)}>
              <option value="">Todos</option>
              {typeOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="operacao-filters__field">
          <span>Técnico</span>
          <select value={filters.technician} onChange={(e) => onChange("technician", e.target.value)}>
            <option value="">Todos</option>
            {technicianOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="operacao-filters__field">
          <span>Cliente</span>
          <select value={filters.customer} onChange={(e) => onChange("customer", e.target.value)}>
            <option value="">Todos</option>
            {customerOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
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
