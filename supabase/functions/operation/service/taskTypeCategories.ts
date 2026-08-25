// Categorias pedidas explicitamente para o painel "Métricas do Dia" do CEO.
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
}

export const DAILY_TYPE_CATEGORIES: TaskTypeCategoryConfig[] = [
  { key: "abastecimentoChamado", label: "Abastecimento - Chamado", matches: ["Abastecimento - Chamado"] },
  { key: "abastecimentoRotina", label: "Abastecimento Rotina", matches: ["Abastecimento Rotina"] },
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
