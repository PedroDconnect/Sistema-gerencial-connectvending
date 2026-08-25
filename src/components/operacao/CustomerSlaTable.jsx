import { formatDurationHours, formatPercent } from "../../services/operacaoService";

export function CustomerSlaTable({ rows, slaHours, loading }) {
  return (
    <section className="card operacao-breakdown-table">
      <h2 className="card-title">Tempo Médio de Atendimento por Cliente</h2>
      <p className="ativos-distribution__hint">
        Da criação do chamado no sistema até o check-out do técnico. SLA de {slaHours}h, aplicado só a Chamado
        Técnico corretivo e Abastecimento - Chamado — VmPay/UpPay e demais tipos ficam fora dessa conta. Só entram
        chamados já finalizados com check-out. Chamados criados com muita antecedência da visita agendada aparecem
        com dias em vez de horas — é o tempo desde a abertura do registro, não o tempo de atendimento presencial.
      </p>

      {loading ? (
        <div className="skeleton" style={{ height: 220, marginTop: 14 }} />
      ) : rows.length === 0 ? (
        <div className="state-empty" style={{ height: 100 }}>
          Nenhum chamado com check-out no período selecionado.
        </div>
      ) : (
        <div className="ativos-table-wrap" style={{ maxHeight: 420 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num">Atendidos</th>
                <th className="num">Tempo Médio</th>
                <th className="num">Dentro do SLA</th>
                <th className="num">Fora do SLA</th>
                <th className="num">% no SLA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.customerId}>
                  <td className="k ativos-table__truncate" title={row.customerName}>
                    {row.customerName}
                  </td>
                  <td className="num">{row.completed.toLocaleString("pt-BR")}</td>
                  <td className="num">{formatDurationHours(row.avgDurationHours)}</td>
                  <td className="num">{row.withinSla.toLocaleString("pt-BR")}</td>
                  <td className={`num ${row.outsideSla > 0 ? "operacao-value--danger" : ""}`}>
                    {row.outsideSla.toLocaleString("pt-BR")}
                  </td>
                  <td className="num">{formatPercent(row.slaComplianceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
