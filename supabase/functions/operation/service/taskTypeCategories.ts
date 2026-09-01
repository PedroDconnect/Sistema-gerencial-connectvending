// Categorias pedidas explicitamente para o painel "Métricas do Dia" do Painel Gerencial.
// Nomes confirmados contra dados reais da Auvo (amostra de 7 dias, ~5.100
// tarefas) — nunca inventados. Duas exceções sinalizadas e decididas com o
// usuário:
// - "Chamado logística": não apareceu em nenhum dos dias amostrados. Fica
//   com contagem zerada até a Auvo ter uma tarefa desse tipo — decisão
//   explícita do usuário de incluir mesmo assim.
// - "Degustação": a Auvo não tem um tipo chamado exatamente "Degustação" —
//   o real é "Instalação de degustação". Usuário pediu para tratar os dois
//   nomes (caso "Degustação" também apareça um dia) como a mesma categoria.
export interface TaskTypeCategoryConfig {
  key: string;
  label: string;
  matches: string[];
  // true só para "Abastecimento Rotina" — separa as duas páginas de
  // Operação (Chamados × Abastecimento Rotina, ver PLANO de 01/09/2026):
  // esse tipo sozinho domina o volume diário, então as duas telas
  // precisam saber, sem ambiguidade, quem é "rotina" e quem é "chamado".
  routine?: boolean;
}

export const DAILY_TYPE_CATEGORIES: TaskTypeCategoryConfig[] = [
  { key: "abastecimentoChamado", label: "Abastecimento - Chamado", matches: ["Abastecimento - Chamado"] },
  { key: "abastecimentoRotina", label: "Abastecimento Rotina", matches: ["Abastecimento Rotina"], routine: true },
  { key: "chamadoLogistica", label: "Chamado Logística", matches: ["Chamado logística"] },
  { key: "chamadoCorretivo", label: "Chamado Técnico Corretivo", matches: ["Chamado Técnico corretivo"] },
  { key: "vmpayUppay", label: "Chamado VmPay / UpPay", matches: ["Chamado VmPay / UpPay"] },
  { key: "degustacao", label: "Degustação", matches: ["Instalação de degustação", "Degustação"] },
  { key: "finalizacaoMaquina", label: "Finalização de Máquina", matches: ["Finalização de maquina - Técnica Interna"] },
];

export function classifyDailyTypeCategory(taskTypeName: string): string | null {
  const found = DAILY_TYPE_CATEGORIES.find((c) => c.matches.includes(taskTypeName));
  return found?.key ?? null;
}

export const DAILY_TYPE_CATEGORY_KEYS = new Set(DAILY_TYPE_CATEGORIES.map((c) => c.key));

// Nomes exatos de tipo de tarefa (taskTypeName) por página de Operação —
// usados tanto pra filtrar localmente (fallback, ver operationService.ts)
// quanto pra resolver quais taskTypeId buscar direto na Auvo (ver
// taskTypeCatalog.ts). "Rotina" é sempre 1 nome; "Chamados" é todo o resto
// desta lista (nunca inventa um 8º tipo — o que não bate com nenhum destes
// nomes, hoje, simplesmente não existe nos dados reais).
export const ROTINA_TASK_TYPE_NAMES = DAILY_TYPE_CATEGORIES.filter((c) => c.routine).flatMap((c) => c.matches);
export const CHAMADOS_TASK_TYPE_NAMES = DAILY_TYPE_CATEGORIES.filter((c) => !c.routine).flatMap((c) => c.matches);

export function isRoutineTaskTypeName(taskTypeName: string): boolean {
  return ROTINA_TASK_TYPE_NAMES.includes(taskTypeName);
}
