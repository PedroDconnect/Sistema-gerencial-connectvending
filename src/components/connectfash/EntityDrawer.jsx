import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useOperacaoTasks } from "../../hooks/useOperacaoTasks";
import { taskStatusLabel, taskStatusBadgeVariant, taskSlaStatus } from "../../services/operacaoService";

const SLA_BADGE = {
  within: { label: "Dentro do SLA", variant: "success" },
  outside: { label: "Fora do SLA", variant: "danger" },
  pending: { label: "Em andamento", variant: "neutral" },
  not_applicable: { label: "Fora do escopo", variant: "neutral" },
};

const PAGE_SIZE = 10;

// Drill-down do ConnectFash: lista as OS reais de um técnico ou cliente no
// período selecionado (mesmo endpoint /tasks que a Auditoria Operacional
// já usa) e deixa abrir o detalhe (TaskDetailDrawer, por cima deste) ou
// vincular um novo chamado à OS. Só é montado quando `entity` existe — ver
// ConnectFashPage — por isso não precisa lidar com entity===null aqui
// dentro (mesmo motivo de useOperacaoTasks não ter guarda de "id vazio").
export function EntityDrawer({ entity, rangeParams, onClose, onOpenTask, onLinkTask }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [entity.type, entity.id]);

  const params = useMemo(() => {
    const base = { ...rangeParams, page, pageSize: PAGE_SIZE };
    return entity.type === "technician" ? { ...base, technician: entity.id } : { ...base, customer: entity.id };
  }, [entity.type, entity.id, rangeParams, page]);

  const tasks = useOperacaoTasks(params);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const totalPages = Math.max(1, Math.ceil((tasks.total || 0) / PAGE_SIZE));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`OS de ${entity.label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-panel__header">
          <div>
            <h2>{entity.label}</h2>
            <p>
              {entity.type === "technician" ? "Técnico" : "Cliente"} · {tasks.total.toLocaleString("pt-BR")} OS no
              período
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="drawer-panel__body">
          {tasks.loading ? (
            <div className="skeleton" style={{ height: 240 }} />
          ) : tasks.error ? (
            <div className="state-error-block" style={{ borderColor: "var(--status-critical)" }}>
              <div>
                <strong>Não foi possível carregar as OS.</strong>
                <p>{tasks.error.message}</p>
              </div>
            </div>
          ) : tasks.items.length === 0 ? (
            <div className="state-empty">Nenhuma OS no período selecionado.</div>
          ) : (
            <>
              <div className="ativos-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="num">ID</th>
                      <th>Tipo</th>
                      <th>Status</th>
                      <th>SLA</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.items.map((task) => {
                      const sla = SLA_BADGE[taskSlaStatus(task)];
                      return (
                        <tr key={task.id}>
                          <td className="num">{task.id}</td>
                          <td className="ativos-table__truncate" title={task.taskTypeName}>
                            {task.taskTypeName || "—"}
                          </td>
                          <td>
                            <span className={`badge badge--${taskStatusBadgeVariant(task.status)}`}>
                              {taskStatusLabel(task.status)}
                            </span>
                          </td>
                          <td>
                            <span className={`badge badge--${sla.variant}`}>{sla.label}</span>
                          </td>
                          <td>
                            <div className="operacao-audit__actions">
                              <button type="button" className="link-btn" onClick={() => onOpenTask(task.id)}>
                                Ver detalhes
                              </button>
                              <button type="button" className="link-btn" onClick={() => onLinkTask(task)}>
                                Vincular chamado
                              </button>
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
                  Página {page} de {totalPages}
                </span>
                <div className="ativos-pagination__nav">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
