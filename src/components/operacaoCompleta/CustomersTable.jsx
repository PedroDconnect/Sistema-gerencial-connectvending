import { activeMeta } from "../../services/operacaoCompletaService";

export function CustomersTable({ customers, page, pageSize, onPageChange, onSelect }) {
  const { items, total, loading, error } = customers;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <section className="card ativos-table-card">
      <div className="ativos-table-card__header">
        <h2 className="card-title">Clientes</h2>
        <span className="ativos-table-card__count">{total.toLocaleString("pt-BR")} clientes</span>
      </div>

      {error && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar os clientes.</strong>
            <p>{error.message}</p>
          </div>
        </div>
      )}

      <div className="ativos-table-wrap">
        <table className="data-table ativos-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Cliente</th>
              <th>Cidade</th>
              <th>Estado</th>
              <th className="num">Máquinas</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5}>
                      <div className="stat-tile--skeleton" style={{ height: 18, borderRadius: 6 }} />
                    </td>
                  </tr>
                ))
              : items.map((customer) => {
                  const meta = activeMeta(customer.active);
                  return (
                    <tr key={customer.customerId} tabIndex={0} onClick={() => onSelect(customer)}>
                      <td>
                        <span className={`badge badge--${meta.variant}`}>{meta.label}</span>
                      </td>
                      <td className="k">{customer.name || "Não informado"}</td>
                      <td>{customer.city || "—"}</td>
                      <td>{customer.state || "—"}</td>
                      <td className="num">
                        {customer.equipmentCount === 0 ? (
                          <span className="ativos-table__muted">0</span>
                        ) : (
                          customer.equipmentCount.toLocaleString("pt-BR")
                        )}
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
            <strong>Nenhum cliente encontrado.</strong>
            <br />
            Tente ajustar os filtros ou realizar uma nova busca.
          </p>
        </div>
      )}

      {total > 0 && (
        <div className="ativos-pagination">
          <span className="ativos-pagination__label">
            {rangeStart.toLocaleString("pt-BR")}–{rangeEnd.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}{" "}
            clientes
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
