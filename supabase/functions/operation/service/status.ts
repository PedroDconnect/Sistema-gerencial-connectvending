// Enum interno de status de tarefa — nunca comparar "status === 1" fora
// deste arquivo. Os valores numéricos coincidem com os da Auvo (1-6) hoje,
// mas o nome/label centralizados aqui é o que o resto do sistema usa.

export const TaskStatus = {
  OPENED: 1,
  IN_DISPLACEMENT: 2,
  CHECKED_IN: 3,
  CHECKED_OUT: 4,
  FINISHED: 5,
  PAUSED: 6,
} as const;

export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TASK_STATUS_LABELS: Record<TaskStatusValue, string> = {
  [TaskStatus.OPENED]: "Aberta",
  [TaskStatus.IN_DISPLACEMENT]: "Em deslocamento",
  [TaskStatus.CHECKED_IN]: "Em atendimento",
  [TaskStatus.CHECKED_OUT]: "Check-out realizado",
  [TaskStatus.FINISHED]: "Finalizada",
  [TaskStatus.PAUSED]: "Pausada",
};

export function taskStatusLabel(status: number): string {
  return TASK_STATUS_LABELS[status as TaskStatusValue] ?? "Desconhecido";
}

export const ALL_TASK_STATUSES: TaskStatusValue[] = [
  TaskStatus.OPENED,
  TaskStatus.IN_DISPLACEMENT,
  TaskStatus.CHECKED_IN,
  TaskStatus.CHECKED_OUT,
  TaskStatus.FINISHED,
  TaskStatus.PAUSED,
];
