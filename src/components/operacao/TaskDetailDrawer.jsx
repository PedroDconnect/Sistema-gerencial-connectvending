import { useEffect, useRef } from "react";
import { Icon } from "../Icon";
import { useOperacaoTask } from "../../hooks/useOperacaoTask";
import {
  taskStatusLabel,
  taskSlaStatus,
  computeTaskDurationHours,
  formatDurationHours,
  SLA_HOURS,
} from "../../services/operacaoService";

const SLA_LABEL = {
  within: "Dentro do SLA",
  outside: "Fora do SLA",
  pending: "Em andamento",
  not_applicable: "Fora do escopo do SLA",
};

function PlainRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="drawer-field">
      <span className="drawer-field__label">{label}</span>
      <span className="drawer-field__value">{value}</span>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function TaskDetailDrawer({ taskId, onClose }) {
  const { loading, error, task } = useOperacaoTask(taskId);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!taskId) return undefined;
    closeButtonRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [taskId, onClose]);

  if (!taskId) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes da tarefa"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-panel__header">
          <div>
            <h2>Detalhes da Tarefa</h2>
            <p>{task ? `#${task.id}` : `#${taskId}`}</p>
          </div>
          <button type="button" className="icon-btn" ref={closeButtonRef} onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="drawer-panel__body">
          {loading && <div className="skeleton" style={{ height: 200 }} />}

          {error && (
            <div className="state-error-block" style={{ borderColor: "var(--status-critical)" }}>
              <div>
                <strong>Não foi possível carregar a tarefa.</strong>
                <p>{error.message}</p>
              </div>
            </div>
          )}

          {task && (
            <>
              {task.customerName && (
                <section className="drawer-section drawer-section--highlight">
                  <span className="drawer-section__eyebrow">Cliente</span>
                  <h3 className="drawer-client-name">{task.customerName}</h3>
                  <div className="drawer-client-meta">
                    <span>{task.address}</span>
                  </div>
                </section>
              )}

              <section className="drawer-section">
                <span className="drawer-section__eyebrow">Identificação</span>
                <PlainRow label="Tipo" value={task.taskTypeName} />
                <PlainRow label="Status" value={taskStatusLabel(task.status)} />
                <PlainRow label="Colaborador" value={task.technicianName} />
                <PlainRow label="Data" value={formatDateTime(task.taskDate)} />
                <PlainRow label="Prioridade" value={task.priority} />
              </section>

              <section className="drawer-section">
                <span className="drawer-section__eyebrow">Execução</span>
                <PlainRow label="Check-in" value={formatDateTime(task.checkInDate)} />
                <PlainRow label="Check-out" value={formatDateTime(task.checkOutDate)} />
                <PlainRow label="Motivo da pausa" value={task.reasonForPause} />
              </section>

              <section className="drawer-section">
                <span className="drawer-section__eyebrow">SLA ({SLA_HOURS}h — abertura até check-out)</span>
                {taskSlaStatus(task) === "not_applicable" ? (
                  <p className="drawer-field__hint">
                    SLA se aplica só a Chamado Técnico corretivo e Abastecimento - Chamado.
                  </p>
                ) : (
                  <PlainRow label="Tempo de atendimento" value={formatDurationHours(computeTaskDurationHours(task))} />
                )}
                <div className="drawer-field">
                  <span className="drawer-field__label">Situação</span>
                  <span
                    className="drawer-field__value"
                    style={taskSlaStatus(task) === "outside" ? { color: "var(--status-critical)", fontWeight: 700 } : undefined}
                  >
                    {SLA_LABEL[taskSlaStatus(task)]}
                  </span>
                </div>
              </section>

              {task.taskUrl && (
                <a
                  className="btn btn--primary btn--block"
                  href={task.taskUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Auditar na Auvo ↗
                </a>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
