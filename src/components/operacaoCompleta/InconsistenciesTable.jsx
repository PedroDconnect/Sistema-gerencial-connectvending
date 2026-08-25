import { matchStatusMeta } from "../../services/operacaoCompletaService";

export function InconsistenciesTable({ inconsistencies, page, pageSize, onPageChange, onSelect }) {
  const { items, total, loading, error } = inconsistencies;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="card ativos-table-card">
      <div className="ativos-table-card__header">
        <div>
          <h2 className="card-title">Inconsistências de patrimônio</h2>
          <p className="assets-map__subtitle">Máquinas Auvo cujo patrimônio não casou de forma limpa com a VMpay.</p>
        </div>
        <span className="ativos-table-card__count">{total.toLocaleString("pt-BR")} máquinas</span>
      </div>

      {error && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar as inconsistências.</strong>
            <p>{error.message}</p>
          </div>
        </div>
      )}

      <div className="ativos-table-wrap">
        <table className="data-table ativos-table">
          <thead>
            <tr>
              <th>Patrimônio</th>
              <th>Auvo</th>
              <th>VMpay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={4}>
                      <div className="stat-tile--skeleton" style={{ height: 18, borderRadius: 6 }} />
                    </td>
                  </tr>
                ))
              : items.map((row) => {
                  const meta = matchStatusMeta(row.matchStatus);
                  return (
                    <tr key={row.auvoEquipmentId} tabIndex={0} onClick={() => onSelect(row)}>
                      <td className="num">{row.normalizedPatrimony}</td>
                      <td className="k">
                        {row.equipmentName || "Não informado"} ({row.auvoIdentifier || "—"})
                      </td>
                      <td>
                        {row.vmpayAssetNumber ||
                          (row.matchStatus === "DUPLICATE" ? (
                            <span className="ativos-table__muted">{row.candidateCount} candidatos</span>
                          ) : (
                            <span className="ativos-table__muted">Não encontrado</span>
                          ))}
                      </td>
                      <td>
                        <span className={`badge badge--${meta.variant}`}>{meta.label}</span>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {!loading && total === 0 && (
        <div className="state-empty">
          <p>
            <strong>Nenhuma inconsistência encontrada.</strong>
            <br />
            Todos os patrimônios Auvo casaram com a VMpay.
          </p>
        </div>
      )}

      {total > 0 && (
        <div className="ativos-pagination">
          <span className="ativos-pagination__label">Página {page} de {totalPages}</span>
          <div className="ativos-pagination__nav">
            <button type="button" className="btn btn--secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              Anterior
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
