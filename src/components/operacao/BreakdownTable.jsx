import { formatPercent } from "../../services/operacaoService";

// A partir daqui uma taxa de conclusão é "boa" (barra verde) — abaixo,
// vermelha. Pedido explícito pro ranking de técnicos; mesmo limiar serve
// pra qualquer BreakdownTable que ligar highlightRate.
const RATE_GOOD_THRESHOLD = 70;

// Ranking de quem mais e quem menos faz tarefas — as linhas já chegam na
// ordem que devem aparecer (por total, ou por taxa quando highlightRate
// está ligado — ver quem chama), o número de posição aqui só torna isso
// explícito (1º = topo do ranking, último = fim).
export function BreakdownTable({ title, nameLabel, rows, loading, highlightRate = false }) {
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
              {rows.map((row, i) => {
                const isGood = row.completionRate >= RATE_GOOD_THRESHOLD;
                return (
                  <tr key={row.key}>
                    <td className="num operacao-breakdown-table__rank">{i + 1}º</td>
                    <td className="k ativos-table__truncate" title={row.label}>
                      {row.label}
                    </td>
                    <td className="num">{row.total.toLocaleString("pt-BR")}</td>
                    <td className="num">{row.finished.toLocaleString("pt-BR")}</td>
                    <td className="num">
                      {highlightRate ? (
                        <span className="operacao-breakdown-table__rate">
                          <span className="ativos-distribution__track operacao-breakdown-table__rate-track">
                            <span
                              className={`ativos-distribution__fill ativos-distribution__fill--${isGood ? "success" : "danger"}`}
                              style={{ width: `${Math.min(row.completionRate, 100)}%` }}
                            />
                          </span>
                          <span className={isGood ? "operacao-value--success" : "operacao-value--danger"}>
                            {formatPercent(row.completionRate)}
                          </span>
                        </span>
                      ) : (
                        formatPercent(row.completionRate)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
