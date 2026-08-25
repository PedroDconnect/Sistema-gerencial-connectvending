import { NEGATIVE_CUSTOMER_TYPE_KEYS } from "../../services/operacaoService";

export function CustomerTypeTable({ rows, categories, loading }) {
  return (
    <section className="card operacao-breakdown-table">
      <h2 className="card-title">Chamados por Cliente</h2>
      <p className="ativos-distribution__hint">
        Quantidade de cada tipo de chamado por cliente, no período selecionado — do que tem mais para o que tem menos.
        Abastecimento fora da rota e chamado corretivo aparecem em destaque por indicarem problema operacional.
      </p>

      {loading ? (
        <div className="skeleton" style={{ height: 220, marginTop: 14 }} />
      ) : rows.length === 0 ? (
        <div className="state-empty" style={{ height: 100 }}>
          Nenhum chamado para o período selecionado.
        </div>
      ) : (
        <div className="ativos-table-wrap operacao-customer-type-wrap" style={{ maxHeight: 420 }}>
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Cliente</th>
                {categories.map((cat) => (
                  <th key={cat.key} className="num">
                    {cat.label}
                  </th>
                ))}
                <th className="num">Outros</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.customerId}>
                  <td className="k ativos-table__truncate" title={row.customerName}>
                    {row.customerName}
                  </td>
                  {categories.map((cat) => {
                    const value = row[cat.key];
                    const isNegative = NEGATIVE_CUSTOMER_TYPE_KEYS.includes(cat.key) && value > 0;
                    return (
                      <td key={cat.key} className={`num ${isNegative ? "operacao-value--danger" : ""}`}>
                        {value.toLocaleString("pt-BR")}
                      </td>
                    );
                  })}
                  <td className="num">{row.outros.toLocaleString("pt-BR")}</td>
                  <td className="num">
                    <strong>{row.total.toLocaleString("pt-BR")}</strong>
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
