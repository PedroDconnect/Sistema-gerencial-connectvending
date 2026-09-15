const TOP_N = 10;

// Cruza duas fontes já existentes, cada uma real, nenhuma nova:
// /customers (equipmentCount, ordenação por nome — não tem "ordenar por
// máquinas" pronto, então a ordenação por equipmentCount é feita aqui) e
// os totais "em aberto" por categoria técnica/operacional vindos de
// dailyTypeMetrics (ver ConnectFastPage). O id de cliente muda de tipo
// entre as duas fontes (number na Auvo/assets, string nas agregações de
// tarefa) — String() nos dois lados evita um join que silenciosamente
// nunca bate.
export function ClientesComMaquinas({ customers, openByCustomerId, loading, onSelectCustomer }) {
  const rows = [...customers]
    .sort((a, b) => b.equipmentCount - a.equipmentCount)
    .slice(0, TOP_N)
    .map((customer) => {
      const open = openByCustomerId.get(String(customer.customerId)) ?? { tecnico: 0, operacional: 0 };
      return { ...customer, ...open };
    });

  return (
    <section className="card operacao-breakdown-table">
      <h2 className="card-title">Clientes com Máquinas</h2>
      <p className="ativos-distribution__hint">
        Top {TOP_N} clientes por quantidade de máquinas instaladas, com os chamados técnicos e operacionais ainda
        abertos no período selecionado. Clique num cliente para ver as OS.
      </p>

      {loading ? (
        <div className="skeleton" style={{ height: 220, marginTop: 14 }} />
      ) : rows.length === 0 ? (
        <div className="state-empty" style={{ height: 100 }}>
          Nenhum cliente com máquinas cadastradas.
        </div>
      ) : (
        <div className="ativos-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num">Máquinas</th>
                <th className="num">Chamados técnicos abertos</th>
                <th className="num">Chamados operacionais abertos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.customerId}>
                  <td className="k ativos-table__truncate" title={row.name}>
                    {row.name}
                  </td>
                  <td className="num">{row.equipmentCount.toLocaleString("pt-BR")}</td>
                  <td className="num">
                    <span className={`badge badge--${row.tecnico > 0 ? "danger" : "neutral"}`}>{row.tecnico}</span>
                  </td>
                  <td className="num">
                    <span className={`badge badge--${row.operacional > 0 ? "info" : "neutral"}`}>
                      {row.operacional}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => onSelectCustomer(String(row.customerId), row.name)}>
                      Ver OS
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
