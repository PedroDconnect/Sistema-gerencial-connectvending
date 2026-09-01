import { formatPercent } from "../../services/operacaoService";

// Ranking de quem mais e quem menos faz tarefas: as linhas já chegam
// ordenadas por total decrescente (ver aggregate() no backend) — o número
// de posição aqui só torna isso explícito (1º = quem mais faz, último =
// quem menos faz), sem precisar de duas listas separadas.
export function BreakdownTable({ title, nameLabel, rows, loading }) {
  return (
    <section className="card operacao-breakdown-table">
      <h2 className="card-title">{title}</h2>

      {loading ? (
        <div className="skeleton" style={{ height: 160, marginTop: 14 }} />
      ) : rows.length === 0 ? (
        <div className="state-empty" style={{ height: 100 }}>
          Nenhum dado para o período selecionado.
        </div>
      ) : (
        <div className="ativos-table-wrap" style={{ maxHeight: 320 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>{nameLabel}</th>
                <th className="num">Total</th>
                <th className="num">Concluídas</th>
                <th className="num">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.key}>
                  <td className="num operacao-breakdown-table__rank">{i + 1}º</td>
                  <td className="k ativos-table__truncate" title={row.label}>
                    {row.label}
                  </td>
                  <td className="num">{row.total.toLocaleString("pt-BR")}</td>
                  <td className="num">{row.finished.toLocaleString("pt-BR")}</td>
                  <td className="num">{formatPercent(row.completionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
