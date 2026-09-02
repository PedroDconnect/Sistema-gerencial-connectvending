import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { fetchOperation } from "../../lib/operationApi";
import { taskStatusLabel, taskStatusBadgeVariant } from "../../services/operacaoService";

function formatTaskDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Nível 1 (a lista de clientes com total/aberto/finalizado) vem pronto em
// metric.byCustomer — já calculado no /details, sem round-trip. Nível 2 (a
// lista de tarefas de UM cliente, com o link de O.S.) só é buscado quando
// o usuário abre aquela linha — reaproveita o filtro typeCategory+customer
// que já existe em /tasks, sem endpoint novo.
export function DailyTypeMetricModal({ metric, baseParams, customerTypeRows = [], customerTypeCategories = [], onClose }) {
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [customerTasks, setCustomerTasks] = useState({});
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function toggleCustomer(customerId) {
    const isOpen = expandedCustomerId === customerId;
    setExpandedCustomerId(isOpen ? null : customerId);
    if (isOpen || customerTasks[customerId]) return;

    setCustomerTasks((prev) => ({ ...prev, [customerId]: { loading: true, error: null, items: [] } }));
    fetchOperation("/tasks", { ...baseParams, typeCategory: metric.key, customer: customerId, pageSize: 50 })
      .then((data) => {
        setCustomerTasks((prev) => ({ ...prev, [customerId]: { loading: false, error: null, items: data?.items ?? [] } }));
      })
      .catch((error) => {
        setCustomerTasks((prev) => ({ ...prev, [customerId]: { loading: false, error, items: [] } }));
      });
  }

  return (
    <div className="metric-modal-backdrop" onClick={onClose}>
      <div
        className="metric-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes de ${metric.label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="metric-modal-panel__header">
          <div>
            <h2>{metric.label}</h2>
            <p>
              {metric.total.toLocaleString("pt-BR")} chamados ·{" "}
              <span className={metric.finished > 0 ? "operacao-value--success" : ""}>
                {metric.finished.toLocaleString("pt-BR")} finalizados
              </span>{" "}
              ·{" "}
              <span className={metric.open > 0 ? "operacao-value--danger" : ""}>
                {metric.open.toLocaleString("pt-BR")} em aberto
              </span>
            </p>
          </div>
          <button type="button" className="icon-btn" ref={closeButtonRef} onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="metric-modal-panel__body">
          {metric.byCustomer.length === 0 ? (
            <div className="state-empty" style={{ height: 100 }}>
              Nenhum chamado desse tipo no período selecionado.
            </div>
          ) : (
            <>
              <div className="metric-modal__customer-header">
                <span />
                <span>Cliente</span>
                <span className="num">Total</span>
                <span className="num">Aberto</span>
                <span className="num">Finalizado</span>
              </div>

              <ul className="metric-modal__customer-list">
                {metric.byCustomer.map((row) => {
                  const isOpen = expandedCustomerId === row.customerId;
                  const taskState = customerTasks[row.customerId];
                  // Esse cliente pode ter chamados de OUTROS tipos além do que
                  // abriu este modal (ex.: também tem Preventiva, além da
                  // Corretiva listada aqui) — cruza com byCustomerType (já
                  // calculado no /details, mesmo período) pra mostrar isso
                  // sem o usuário precisar fechar o modal e ir procurar na
                  // tabela "Chamados por Cliente" mais embaixo na página.
                  const typeRow = customerTypeRows.find((r) => r.customerId === row.customerId);
                  return (
                    <li key={row.customerId} className="metric-modal__customer">
                      <button
                        type="button"
                        className="metric-modal__customer-row"
                        onClick={() => toggleCustomer(row.customerId)}
                        aria-expanded={isOpen}
                      >
                        <Icon
                          name="chevronDown"
                          size={14}
                          className={`ativos-distribution__chevron ${isOpen ? "is-open" : ""}`}
                        />
                        <span className="metric-modal__customer-name" title={row.customerName}>
                          {row.customerName}
                        </span>
                        <span className="num">{row.total.toLocaleString("pt-BR")}</span>
                        <span className={`num ${row.open > 0 ? "operacao-value--danger" : ""}`}>
                          {row.open.toLocaleString("pt-BR")}
                        </span>
                        <span className={`num ${row.finished > 0 ? "operacao-value--success" : ""}`}>
                          {row.finished.toLocaleString("pt-BR")}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="metric-modal__tasks">
                          {typeRow && (
                            <div className="metric-modal__type-breakdown">
                              <span className="metric-modal__type-breakdown-label">Esse cliente no período, por tipo:</span>
                              {customerTypeCategories.map((cat) => (
                                <span key={cat.key} className="badge badge--neutral">
                                  {cat.label}: {typeRow[cat.key] ?? 0}
                                </span>
                              ))}
                              <span className="badge badge--neutral">Outros: {typeRow.outros ?? 0}</span>
                            </div>
                          )}

                          {taskState?.loading ? (
                            <div className="skeleton" style={{ height: 90 }} />
                          ) : taskState?.error ? (
                            <p className="state-empty" style={{ height: 60 }}>
                              Não foi possível carregar os chamados desse cliente.
                            </p>
                          ) : (
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Data</th>
                                  <th>Colaborador</th>
                                  <th>Status</th>
                                  <th>Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(taskState?.items ?? []).map((task) => (
                                  <tr key={task.id}>
                                    <td>{formatTaskDate(task.taskDate)}</td>
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
                                        <a
                                          className="link-btn"
                                          href={task.taskUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Auditar na Auvo ↗
                                        </a>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
