// Modelo interno de domínio — nenhum campo com nome da Auvo (ou de
// qualquer outra API futura) deve passar disso pra frente.

export interface Task {
  id: number;
  externalId: string;
  taskTypeId: number;
  taskTypeName: string;
  technicianId: number;
  technicianName: string;
  customerId: number;
  customerName: string;
  creationDate: string | null;
  taskDate: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  priority: number | null;
  status: number;
  finished: boolean;
  checkIn: boolean;
  checkInDate: string | null;
  checkOut: boolean;
  checkOutDate: string | null;
  reasonForPause: string;
  taskUrl: string | null;
}

export interface TaskFilters {
  dateFrom: string; // yyyy-MM-dd
  dateTo: string; // yyyy-MM-dd
  status?: number;
  technicianId?: number;
  customerId?: number;
  taskTypeId?: number;
  // "within" | "outside" — nunca enviado à Auvo, aplicado no
  // OperationService sobre tarefas reais (ver taskSlaStatus).
  sla?: "within" | "outside";
  // Chave de DAILY_TYPE_CATEGORIES — nunca enviado à Auvo, aplicado no
  // OperationService sobre tarefas reais (ver classifyDailyTypeCategory).
  // Alimenta o botão "Visualizar" das métricas do dia.
  typeCategory?: string;
}

export interface TaskListParams extends TaskFilters {
  page: number;
  pageSize: number;
}

export interface TaskPage {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProviderHealth {
  provider: string;
  online: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

// Contrato que o OperationService conhece — nenhuma referência direta à
// Auvo (ou a qualquer provider futuro) fora da própria pasta integrations/.
export interface IntegrationProvider {
  name: string;
  countTasks(filters: TaskFilters): Promise<number>;
  listTasks(params: TaskListParams): Promise<TaskPage>;
  getTask(id: number): Promise<Task | null>;
  health(): Promise<ProviderHealth>;
}
