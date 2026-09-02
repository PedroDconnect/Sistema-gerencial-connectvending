import { Select } from "../Select";
import { PERIOD_PRESETS, TASK_STATUS_OPTIONS, SLA_FILTER_OPTIONS } from "../../services/operacaoService";

// Select.jsx trabalha com {value, label}; byTechnician/byCustomer/byType
// (ver OperacaoPage.jsx) vêm como {key, label} — só remapeia o nome do
// campo, sem tocar na origem dos dados.
function toSelectOptions(rows) {
  return rows.map((row) => ({ value: row.key, label: row.label }));
}

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
          <Select
            className="operacao-filters__field--sla"
            label="SLA"
            value={filters.sla}
            onChange={(value) => onChange("sla", value)}
            options={SLA_FILTER_OPTIONS}
            placeholder="Todos os chamados"
          />
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
        <Select label="Status" value={filters.status} onChange={(value) => onChange("status", value)} options={TASK_STATUS_OPTIONS} />

        {showTypeFilter && (
          <Select
            label="Tipo de operação"
            value={filters.type}
            onChange={(value) => onChange("type", value)}
            options={toSelectOptions(typeOptions)}
          />
        )}

        <Select
          label="Colaborador"
          value={filters.technician}
          onChange={(value) => onChange("technician", value)}
          options={toSelectOptions(technicianOptions)}
        />

        <Select
          label="Cliente"
          value={filters.customer}
          onChange={(value) => onChange("customer", value)}
          options={toSelectOptions(customerOptions)}
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
