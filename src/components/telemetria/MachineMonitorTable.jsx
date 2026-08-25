import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { MultiSelect } from "../ativos/MultiSelect";
import { MACHINE_STATUS_META, formatDateTime, formatRssi, formatCarrier, sortMachines, statusFilterLabel } from "../../services/vmpayService";

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: "status", label: "Status", sortable: true },
  { key: "machineId", label: "Máquina", sortable: true },
  { key: "assetNumber", label: "Asset", sortable: true },
  { key: "locationName", label: "Cliente", sortable: true },
  { key: "place", label: "Local", sortable: true },
  { key: "lastVendAt", label: "Última dose", sortable: true },
  { key: "lastCommunicationAt", label: "Última comunicação", sortable: true },
  { key: "rssi", label: "Sinal", sortable: false },
  { key: "carrier", label: "Operadora", sortable: false },
];

const STATUS_FILTER_LABELS = Object.keys(MACHINE_STATUS_META).map((status) => statusFilterLabel(status));

export function MachineMonitorTable({
  machines,
  loading,
  search,
  onSearchChange,
  statusFilters,
  onStatusFiltersChange,
  onSelect,
}) {
  const [sortKey, setSortKey] = useState("status");
  const [direction, setDirection] = useState("asc");
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [search, statusFilters, machines]);

  const sorted = useMemo(() => sortMachines(machines, sortKey, direction), [machines, sortKey, direction]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, sorted.length);

  function toggleSort(key) {
    if (sortKey === key) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("asc");
    }
  }

  return (
    <section className="card ativos-table-card">
      <div className="ativos-table-card__header">
        <h2 className="card-title">Máquinas</h2>
        <span className="ativos-table-card__count">{sorted.length.toLocaleString("pt-BR")} máquinas</span>
      </div>

      <div className="telemetria-table__filters">
        <div className="ativos-filters__search">
          <Icon name="search" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por máquina, asset, cliente ou local..."
          />
        </div>
        <MultiSelect
          label="Status"
          options={STATUS_FILTER_LABELS}
          selected={statusFilters}
          onChange={onStatusFiltersChange}
        />
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 320, marginTop: 14 }} />
      ) : (
        <>
          <div className="ativos-table-wrap">
            <table className="data-table ativos-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={col.sortable ? "is-sortable" : ""}
                      onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                    >
                      <span className="ativos-table__th-inner">
                        {col.label}
                        {col.sortable && sortKey === col.key && (
                          <Icon
                            name="chevronDown"
                            size={12}
                            className={`ativos-table__sort-icon ${direction === "desc" ? "is-desc" : ""}`}
                          />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((machine) => {
                  const meta = MACHINE_STATUS_META[machine.status] ?? MACHINE_STATUS_META.data_unavailable;
                  return (
                    <tr key={machine.machineId} tabIndex={0} onClick={() => onSelect(machine)}>
                      <td>
                        <span className={`badge badge--${meta.variant}`}>
                          {meta.emoji} {meta.label}
                        </span>
                      </td>
                      <td className="num">{machine.machineId}</td>
                      <td className="num">{machine.assetNumber || "—"}</td>
                      <td className="ativos-table__truncate" title={machine.locationName || undefined}>
                        {machine.locationName || <span className="ativos-table__muted">—</span>}
                      </td>
                      <td className="ativos-table__truncate" title={machine.place || undefined}>
                        {machine.place || "—"}
                      </td>
                      <td className="num">{formatDateTime(machine.lastVendAt)}</td>
                      <td className="num">{formatDateTime(machine.lastCommunicationAt)}</td>
                      <td className="num">{formatRssi(machine.connection?.rssi)}</td>
                      <td>{formatCarrier(machine.connection)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sorted.length === 0 ? (
            <div className="state-empty">
              <p>
                <strong>Nenhuma máquina encontrada.</strong>
                <br />
                Tente ajustar os filtros ou a busca.
              </p>
            </div>
          ) : (
            <div className="ativos-pagination">
              <span className="ativos-pagination__label">
                {rangeStart.toLocaleString("pt-BR")}–{rangeEnd.toLocaleString("pt-BR")} de{" "}
                {sorted.length.toLocaleString("pt-BR")} máquinas
              </span>
              <div className="ativos-pagination__nav">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <span className="ativos-pagination__page">
                  Página {safePage} de {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
