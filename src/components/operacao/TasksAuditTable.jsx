import { taskStatusLabel, taskStatusBadgeVariant, taskSlaStatus, computeTaskDurationHours, formatDurationHours } from "../../services/operacaoService";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const SLA_BADGE = {
  within: { label: "Dentro do SLA", variant: "success" },
  outside: { label: "Fora do SLA", variant: "danger" },
  pending: { label: "Em andamento", variant: "neutral" },
  not_applicable: { label: "Fora do escopo", variant: "neutral" },
};

function formatTaskDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TasksAuditTable({ tasks, page, pageSize, onPageChange, onPageSizeChange, onSelect }) {
  const totalPages = Math.max(1, Math.ceil((tasks.total || 0) / pageSize));
  const rangeStart = tasks.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, tasks.total);

  return (
    <section id="operacao-audit" className="card ativos-table-card">
      <div className="ativos-table-card__header">
        <h2 className="card-title">Auditoria Operacional</h2>
        <div className="operacao-audit__page-size">
          <span>Por página:</span>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              className={`segmented__btn ${pageSize === size ? "is-active" : ""}`}
              onClick={() => onPageSizeChange(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {tasks.loading ? (
        <div className="skeleton" style={{ height: 260 }} />
      ) : tasks.items.length === 0 ? (
        <div className="state-empty">
          <p>
            <strong>Nenhuma tarefa encontrada.</strong>
            <br />
            Tente ajustar os filtros ou o período.
          </p>
        </div>
      ) : (
        <>
          <div className="ativos-table-wrap">
            <table className="data-table ativos-table">
              <thead>
                <tr>
                  <th className="num">ID</th>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Técnico</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th className="num">Atendimento</th>
                  <th>SLA</th>
                  <th>Local</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {tasks.items.map((task) => {
                  const sla = SLA_BADGE[taskSlaStatus(task)];
                  const duration = computeTaskDurationHours(task);
                  return (
                    <tr key={task.id}>
                      <td className="num">{task.id}</td>
                      <td className="num">{formatTaskDate(task.taskDate)}</td>
                      <td>{task.taskTypeName || "—"}</td>
                      <td className="ativos-table__truncate" title={task.technicianName}>
                        {task.technicianName || "—"}
                      </td>
                      <td className="ativos-table__truncate" title={task.customerName}>
                        {task.customerName || <span className="ativos-table__muted">Sem cliente</span>}
                      </td>
                      <td>
                        <span className={`badge badge--${taskStatusBadgeVariant(task.status)}`}>{taskStatusLabel(task.status)}</span>
                      </td>
                      <td className="num">{formatDurationHours(duration)}</td>
                      <td>
                        <span className={`badge badge--${sla.variant}`}>{sla.label}</span>
                      </td>
                      <td className="ativos-table__truncate" title={task.address}>
                        {task.address || "—"}
                      </td>
                      <td>
                        <div className="operacao-audit__actions">
                          <button type="button" className="link-btn" onClick={() => onSelect(task)}>
                            Ver detalhes
                          </button>
                          {task.taskUrl && (
                            <a className="link-btn" href={task.taskUrl} target="_blank" rel="noopener noreferrer">
                              Auditar na Auvo ↗
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="ativos-pagination">
            <span className="ativos-pagination__label">
              {rangeStart.toLocaleString("pt-BR")}–{rangeEnd.toLocaleString("pt-BR")} de {tasks.total.toLocaleString("pt-BR")} tarefas
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
        </>
      )}
    </section>
  );
}
