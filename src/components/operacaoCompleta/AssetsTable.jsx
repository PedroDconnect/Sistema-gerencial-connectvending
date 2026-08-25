import { activeMeta, formatDate } from "../../services/operacaoCompletaService";

export function AssetsTable({ assets, page, pageSize, onPageChange, onSelect }) {
  const { items, total, loading, error } = assets;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <section className="card ativos-table-card">
      <div className="ativos-table-card__header">
        <h2 className="card-title">Máquinas</h2>
        <span className="ativos-table-card__count">{total.toLocaleString("pt-BR")} máquinas</span>
      </div>

      {error && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar os ativos.</strong>
            <p>{error.message}</p>
          </div>
        </div>
      )}

      <div className="ativos-table-wrap">
        <table className="data-table ativos-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Máquina</th>
              <th>Identifier</th>
              <th>Local interno</th>
              <th>Cliente</th>
              <th>Cidade</th>
              <th>Estado</th>
              <th>Data de criação</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8}>
                      <div className="stat-tile--skeleton" style={{ height: 18, borderRadius: 6 }} />
                    </td>
                  </tr>
                ))
              : items.map((asset) => {
                  const meta = activeMeta(asset.equipmentActive);
                  return (
                    <tr key={asset.equipmentId} tabIndex={0} onClick={() => onSelect(asset)}>
                      <td>
                        <span className={`badge badge--${meta.variant}`}>{meta.label}</span>
                      </td>
                      <td className="k">{asset.equipmentName || "Não informado"}</td>
                      <td className="num">{asset.identifier || "—"}</td>
                      <td className="ativos-table__truncate" title={asset.description || undefined}>
                        {asset.description || <span className="ativos-table__muted">Não informado</span>}
                      </td>
                      <td className="ativos-table__truncate" title={asset.customerName || undefined}>
                        {asset.customerName || <span className="ativos-table__muted">Sem cliente associado</span>}
                      </td>
                      <td>{asset.city || "—"}</td>
                      <td>{asset.state || "—"}</td>
                      <td>{formatDate(asset.creationDate)}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {!loading && total === 0 && (
        <div className="state-empty">
          <p>
            <strong>Nenhuma máquina encontrada.</strong>
            <br />
            Tente ajustar os filtros ou realizar uma nova busca.
          </p>
        </div>
      )}

      {total > 0 && (
        <div className="ativos-pagination">
          <span className="ativos-pagination__label">
            {rangeStart.toLocaleString("pt-BR")}–{rangeEnd.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}{" "}
            máquinas
          </span>
          <div className="ativos-pagination__nav">
            <button type="button" className="btn btn--secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              Anterior
            </button>
            <span className="ativos-pagination__page">
              Página {page} de {totalPages}
            </span>
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
