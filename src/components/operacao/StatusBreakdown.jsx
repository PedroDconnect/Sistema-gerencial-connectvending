import { TASK_STATUS, taskStatusLabel, taskStatusBadgeVariant } from "../../services/operacaoService";

const ROWS = [
  TASK_STATUS.OPENED,
  TASK_STATUS.IN_DISPLACEMENT,
  TASK_STATUS.CHECKED_IN,
  TASK_STATUS.CHECKED_OUT,
  TASK_STATUS.FINISHED,
  TASK_STATUS.PAUSED,
];

const COUNT_KEY_BY_STATUS = {
  [TASK_STATUS.OPENED]: "opened",
  [TASK_STATUS.IN_DISPLACEMENT]: "inDisplacement",
  [TASK_STATUS.CHECKED_IN]: "checkedIn",
  [TASK_STATUS.CHECKED_OUT]: "checkedOut",
  [TASK_STATUS.FINISHED]: "finished",
  [TASK_STATUS.PAUSED]: "paused",
};

export function StatusBreakdown({ summary, loading }) {
  const total = summary?.total ?? 0;

  return (
    <section className="card operacao-status-breakdown">
      <h2 className="card-title">Status da Operação</h2>

      {loading ? (
        <div className="skeleton" style={{ height: 180, marginTop: 14 }} />
      ) : (
        <ul className="operacao-status-breakdown__list">
          {ROWS.map((status) => {
            const count = summary?.[COUNT_KEY_BY_STATUS[status]] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
            const variant = taskStatusBadgeVariant(status);
            const valueClass = variant === "success" ? "operacao-value--success" : "operacao-value--danger";
            return (
              <li key={status} className="operacao-status-breakdown__row">
                <span className={`operacao-status-breakdown__name ${valueClass}`}>{taskStatusLabel(status)}</span>
                <span className="ativos-distribution__track">
                  <span className={`ativos-distribution__fill ativos-distribution__fill--${variant}`} style={{ width: `${pct}%` }} />
                </span>
                <span className={`ativos-distribution__count num ${valueClass}`}>{count.toLocaleString("pt-BR")}</span>
                <span className="ativos-distribution__pct num">{pct}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
