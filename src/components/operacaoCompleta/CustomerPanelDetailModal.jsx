import { useState } from "react";
import { Icon } from "../Icon";
import { useCustomerPanel } from "../../hooks/useCustomerPanel";
import { useMachineConsumption } from "../../hooks/useMachineConsumption";
import { formatDateTime, formatDayOnly, formatSyncTime, matchStatusMeta } from "../../services/operacaoCompletaService";
import { taskStatusLabel, taskStatusBadgeVariant } from "../../services/operacaoService";
import { DoseTrendChart } from "./DoseTrendChart";

const PERIOD_PRESETS = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
  { id: "custom", label: "Personalizado" },
];

// Mesmo texto de MachineConsumptionPanel.jsx (drawer da máquina isolada) —
// aqui o clique numa máquina do ranking reaproveita o mesmo endpoint
// GET /machines/:id/consumption, então o aviso de cruzamento precisa dizer
// a mesma coisa nos dois lugares.
const MATCH_WARNING_TEXT = {
  MATCH_NORMALIZED:
    "O patrimônio da Auvo bate com a VMpay só depois de normalizar (ex.: zeros à esquerda) — vale conferir se é o mesmo equipamento.",
  NOT_FOUND: "Nenhuma máquina na VMpay tem esse patrimônio — sem cruzamento não é possível mostrar consumo real.",
  DUPLICATE: "Mais de uma máquina na VMpay compartilha este patrimônio — ambíguo demais pra mostrar consumo com segurança.",
  NOT_COMPUTED: 'Rode "Atualizar dados" para calcular o cruzamento desta máquina.',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function diffDaysInclusive(startDate, endDate) {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

// Barra horizontal proporcional ao maior valor do grupo — usada pro
// consumo por máquina, por produto e pra contagem de chamados por tipo,
// porque em tabela pura de números essas comparações exigiam ler linha
// por linha; em barra, a diferença salta aos olhos. Quando `onClick` é
// passado (só no ranking de máquinas), a linha vira um botão — "gera um
// filtro geral" pedido pelo usuário (19/08/2026): clicar numa máquina
// troca o gráfico/KPIs do cliente inteiro pelo detalhe só daquela máquina.
function RankedBar({ label, sublabel, badge, value, maxValue, unit, onClick, active }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  const content = (
    <>
      <span className="ranked-bar__label">
        <span className="ranked-bar__name" title={label}>
          {label}
        </span>
        {sublabel && <span className="ranked-bar__sublabel">{sublabel}</span>}
        {badge}
      </span>
      <span className="ranked-bar__track">
        <span className="ranked-bar__fill" style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }} />
      </span>
      <span className="ranked-bar__value">
        {value.toLocaleString("pt-BR")}
        {unit ? ` ${unit}` : ""}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`ranked-bar ranked-bar--clickable ${active ? "is-active" : ""}`} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="ranked-bar">{content}</div>;
}

// Popup central com o cruzamento completo e filtrável (consumo VMpay +
// chamados Auvo) — o resumo do drawer fica fixo em 7 dias só pra uma
// leitura rápida; aqui o usuário escolhe o período e as duas fontes são
// buscadas de novo juntas (mesmo endpoint, um cliente só). Layout pensado
// pra "bater o olho": KPIs primeiro, gráfico de linha do consumo diário
// em seguida, e só depois os rankings/detalhe fino — pedido explícito do
// usuário (17/08/2026) reclamando que a versão só em tabelas era difícil
// de entender de cara.
export function CustomerPanelDetailModal({ customerName, auvoCustomerId, onClose }) {
  const [period, setPeriod] = useState("7d");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const [selectedMachineId, setSelectedMachineId] = useState(null);

  const params = period === "custom" ? { start_date: customFrom, end_date: customTo } : { period };
  const { loading, error, data } = useCustomerPanel(auvoCustomerId, params);

  const machines = data ? [...data.consumption.machines].sort((a, b) => b.quantity - a.quantity) : [];
  const maxMachineQty = machines.length > 0 ? machines[0].quantity : 0;
  const maxTaskType = data ? Math.max(...data.tasks.byType.map((t) => t.total), 1) : 1;
  const selectedMachine = selectedMachineId ? machines.find((m) => m.auvoEquipmentId === selectedMachineId) : null;
  // O cruzamento por patrimônio já veio no painel do cliente — só busca o
  // detalhe (byDay + byProduto) quando a máquina está de fato casada;
  // evita uma chamada inútil pra máquina NOT_FOUND/DUPLICATE, que nunca
  // vai ter consumo pra mostrar mesmo.
  const machineDetailId =
    selectedMachine && (selectedMachine.matchStatus === "MATCH" || selectedMachine.matchStatus === "MATCH_NORMALIZED")
      ? selectedMachineId
      : null;
  const machineDetail = useMachineConsumption(machineDetailId, params);

  function toggleMachine(id) {
    setSelectedMachineId((prev) => (prev === id ? null : id));
  }

  const consumptionView = selectedMachine ? null : data?.consumption ?? null;
  const avgPerDay = data
    ? (selectedMachine ? machineDetail.data?.totalQuantity ?? 0 : data.consumption.totalQuantity) /
      diffDaysInclusive(data.startDate, data.endDate)
    : 0;
  const maxProductQty = machineDetail.data?.byProduct?.length
    ? Math.max(...machineDetail.data.byProduct.map((p) => p.quantity), 1)
    : 1;

  return (
    <div className="metric-modal-backdrop" onClick={onClose}>
      <div
        className="metric-modal-panel customer-panel-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Consumo e chamados de ${customerName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="metric-modal-panel__header">
          <div>
            <h2>Consumo e chamados</h2>
            <p>{customerName}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="metric-modal-panel__body">
          <div className="segmented consumption-panel__periods">
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`segmented__btn ${period === preset.id ? "is-active" : ""}`}
                onClick={() => setPeriod(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div className="operacao-filters__custom-dates consumption-panel__custom-dates">
              <label className="operacao-filters__field">
                <span>De</span>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label className="operacao-filters__field">
                <span>Até</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </div>
          )}

          {loading && <div className="stat-tile--skeleton" style={{ height: 200, borderRadius: 12, marginTop: 16 }} />}

          {error && (
            <div className="state-error-block" style={{ marginTop: 16 }}>
              <div>
                <strong>Não foi possível carregar o cruzamento.</strong>
                <p>{error.message}</p>
              </div>
            </div>
          )}

          {!loading && !error && data && (
            <>
              <section className="customer-panel-modal__section">
                <div className="customer-panel-summary__header">
                  <h3 className="customer-panel-modal__section-title" style={{ marginBottom: 0 }}>
                    Consumo VMpay ({formatDayOnly(data.startDate)} – {formatDayOnly(data.endDate)})
                  </h3>
                  {selectedMachine && (
                    <button type="button" className="active-filter-chip" onClick={() => setSelectedMachineId(null)}>
                      <span>
                        {selectedMachine.name || "Não informado"}
                        {selectedMachine.identifier ? ` · Pat. ${selectedMachine.identifier}` : ""}
                      </span>
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </div>

                {selectedMachine ? (
                  <>
                    {machineDetailId && machineDetail.loading && (
                      <div className="stat-tile--skeleton" style={{ height: 160, borderRadius: 12, marginTop: 12 }} />
                    )}

                    {machineDetailId && machineDetail.error && (
                      <div className="state-error-block" style={{ marginTop: 12 }}>
                        <div>
                          <strong>Não foi possível carregar o consumo desta máquina.</strong>
                          <p>{machineDetail.error.message}</p>
                        </div>
                      </div>
                    )}

                    {!machineDetailId && (
                      <div className="state-warning-block" style={{ marginTop: 12 }}>
                        <strong>
                          <span className={`badge badge--${matchStatusMeta(selectedMachine.matchStatus).variant}`}>
                            {matchStatusMeta(selectedMachine.matchStatus).label}
                          </span>
                        </strong>
                        <p>{MATCH_WARNING_TEXT[selectedMachine.matchStatus] ?? MATCH_WARNING_TEXT.NOT_COMPUTED}</p>
                      </div>
                    )}

                    {machineDetailId && !machineDetail.loading && !machineDetail.error && machineDetail.data && (
                      <>
                        <div className="consumption-panel__totals consumption-panel__totals--3">
                          <div className="stat-tile">
                            <div className="stat-tile__label">Doses no período</div>
                            <div className="stat-tile__value num">
                              {machineDetail.data.totalQuantity.toLocaleString("pt-BR")}
                            </div>
                          </div>
                          <div className="stat-tile">
                            <div className="stat-tile__label">Vendas no período</div>
                            <div className="stat-tile__value num">
                              {machineDetail.data.totalSales.toLocaleString("pt-BR")}
                            </div>
                          </div>
                          <div className="stat-tile">
                            <div className="stat-tile__label">Média de doses/dia</div>
                            <div className="stat-tile__value num">
                              {avgPerDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                            </div>
                          </div>
                        </div>

                        <DoseTrendChart byDay={machineDetail.data.byDay} startDate={data.startDate} endDate={data.endDate} />

                        <h4 className="customer-panel-modal__subtitle">Consumo por produto</h4>
                        {machineDetail.data.byProduct.length > 0 ? (
                          <div className="ranked-bar-list">
                            {machineDetail.data.byProduct.map((p) => (
                              <RankedBar
                                key={p.productName}
                                label={p.productName || "Não informado"}
                                value={p.quantity}
                                maxValue={maxProductQty}
                                unit="doses"
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="drawer-field__hint">Nenhuma venda registrada nesta máquina no período.</p>
                        )}

                        <p className="drawer-field__hint consumption-panel__sync-note">
                          Vendas atualizadas em: {formatSyncTime(machineDetail.data.salesSyncedAt)}
                          {machineDetail.data.salesSyncStatus === "error" &&
                            " — Atenção: última sincronização de vendas apresentou erro."}
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="consumption-panel__totals consumption-panel__totals--3">
                      <div className="stat-tile">
                        <div className="stat-tile__label">Doses no período</div>
                        <div className="stat-tile__value num">{consumptionView.totalQuantity.toLocaleString("pt-BR")}</div>
                      </div>
                      <div className="stat-tile">
                        <div className="stat-tile__label">Vendas no período</div>
                        <div className="stat-tile__value num">{consumptionView.totalSales.toLocaleString("pt-BR")}</div>
                      </div>
                      <div className="stat-tile">
                        <div className="stat-tile__label">Média de doses/dia</div>
                        <div className="stat-tile__value num">
                          {avgPerDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                        </div>
                      </div>
                    </div>

                    <DoseTrendChart byDay={consumptionView.byDay} startDate={data.startDate} endDate={data.endDate} />

                    {consumptionView.totalQuantity === 0 && (
                      <p className="drawer-field__hint">Nenhuma venda registrada nas máquinas casadas deste cliente no período.</p>
                    )}

                    <p className="drawer-field__hint consumption-panel__sync-note">
                      Vendas atualizadas em: {formatSyncTime(consumptionView.salesSyncedAt)}
                      {consumptionView.salesSyncStatus === "error" &&
                        " — Atenção: última sincronização de vendas apresentou erro."}
                    </p>
                  </>
                )}

                <h4 className="customer-panel-modal__subtitle">Consumo por máquina</h4>
                <p className="drawer-field__hint">Clique numa máquina para ver o detalhe de doses só dela.</p>
                {machines.length > 0 ? (
                  <div className="ranked-bar-list">
                    {machines.map((m) => {
                      const matchMeta = matchStatusMeta(m.matchStatus);
                      const isProblem = m.matchStatus !== "MATCH" && m.matchStatus !== "MATCH_NORMALIZED";
                      return (
                        <RankedBar
                          key={m.auvoEquipmentId}
                          label={m.name || "Não informado"}
                          sublabel={m.identifier ? `Pat. ${m.identifier}` : null}
                          badge={
                            isProblem ? <span className={`badge badge--${matchMeta.variant}`}>{matchMeta.label}</span> : null
                          }
                          value={m.quantity}
                          maxValue={maxMachineQty}
                          unit="doses"
                          active={selectedMachineId === m.auvoEquipmentId}
                          onClick={() => toggleMachine(m.auvoEquipmentId)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="drawer-field__hint">Nenhuma máquina Auvo cruzada com a VMpay para este cliente.</p>
                )}
              </section>

              <section className="customer-panel-modal__section">
                <h3 className="customer-panel-modal__section-title">
                  Chamados Auvo ({formatDayOnly(data.tasks.dateFrom)} – {formatDayOnly(data.tasks.dateTo)})
                </h3>

                {data.tasks.tasksSyncStatus === "error" && (
                  <div className="state-warning-block">
                    <strong>A última sincronização de chamados apresentou erro.</strong>
                    <p>Os números abaixo são da última sincronização válida.</p>
                  </div>
                )}

                <div className="ranked-bar-list">
                  {data.tasks.byType.map((t) => (
                    <RankedBar
                      key={t.taskTypeName}
                      label={t.taskTypeName}
                      sublabel={t.total > 0 ? `${t.finished} concluído${t.finished === 1 ? "" : "s"}` : null}
                      value={t.total}
                      maxValue={maxTaskType}
                    />
                  ))}
                </div>

                {data.tasks.items.length > 0 && (
                  <>
                    <h4 className="customer-panel-modal__subtitle">Chamados no período</h4>
                    <div className="ativos-table-wrap customer-panel-modal__table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Técnico</th>
                            <th>Status</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.tasks.items.map((task) => (
                            <tr key={task.id}>
                              <td>{formatDateTime(task.taskDate)}</td>
                              <td className="ativos-table__truncate" title={task.taskTypeName}>
                                {task.taskTypeName}
                              </td>
                              <td className="ativos-table__truncate" title={task.technicianName}>
                                {task.technicianName || "—"}
                              </td>
                              <td>
                                <span className={`badge badge--${taskStatusBadgeVariant(task.status)}`}>
                                  {taskStatusLabel(task.status)}
                                </span>
                              </td>
                              <td>
                                {task.taskUrl && (
                                  <a className="link-btn" href={task.taskUrl} target="_blank" rel="noopener noreferrer">
                                    Auditar na Auvo ↗
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {data.tasks.items.length === 0 && data.tasks.tasksSyncStatus !== "error" && (
                  <p className="drawer-field__hint">Nenhum chamado desses tipos no período selecionado.</p>
                )}

                <p className="drawer-field__hint">Chamados atualizados em: {formatSyncTime(data.tasks.tasksSyncedAt)}</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
