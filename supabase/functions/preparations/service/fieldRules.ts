import { TemplateField } from "./pdfService.ts";

export interface FieldCondition {
  field: string;
  op: "eq" | "neq" | "in" | "notIn" | "contains";
  value: unknown;
}

export interface OptionRule {
  when: FieldCondition[];
  removeOptions: string[];
}

export interface OptionsBy {
  field: string;
  map: Record<string, string[]>;
}

function conditionPasses(condition: FieldCondition, values: Record<string, unknown>): boolean {
  const actual = values[condition.field];
  switch (condition.op) {
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case "notIn":
      return Array.isArray(condition.value) && !condition.value.includes(actual);
    // "Outra (texto livre)" companion fields (product_brand_other etc.):
    // o campo pai é multi_select (array), então a checagem é "o array
    // contém este valor fixo", não "o array é um dos valores permitidos"
    // (isso já é o "in"). Ver prompt do formulário, seção Acessórios.
    case "contains":
      return Array.isArray(actual) && actual.includes(condition.value);
    default:
      return true;
  }
}

// visibleIf/optionRules/optionsBy (formulário definitivo, 02/09/2026): a
// seção "Preparo da bebida" só existe pra categorias de máquina com
// sistema de preparo; dentro dela, só "Valor da dose" depende do Modelo
// de negócio (o "Produto"/layout NÃO depende — corrigido nesta versão,
// era um erro de leitura anterior da spec). Motor genérico (lido do JSON
// do template, nunca hardcoded) pra caber regra nova sem mexer em
// código. "values" é sempre o merge base+ficha já resolvido por quem
// chama — mesma função usada pelo wizard (frontend, duplicada em
// preparationFieldRules.js) e pela geração do PDF.
export function isFieldVisible(field: TemplateField, values: Record<string, unknown>): boolean {
  const conditions = (field as { visibleIf?: FieldCondition[] }).visibleIf;
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => conditionPasses(c, values));
}

// Duas fontes de opção dinâmica, que podem coexistir:
// - optionsBy: TROCA a lista inteira conforme outro campo (ex.: Modelo
//   depende inteiramente da Categoria escolhida — "cascata"). Sem valor
//   ainda na Categoria, a lista fica vazia (campo desabilitado até
//   escolher a categoria, pedido explícito do formulário).
// - optionRules: REMOVE opções específicas da lista base/optionsBy (ex.:
//   Acessórios perde "Chave da Máquina" conforme Modelo de negócio).
export function effectiveOptions(field: TemplateField, values: Record<string, unknown>): string[] {
  const optionsBy = (field as { optionsBy?: OptionsBy }).optionsBy;
  let base = field.options ?? [];
  if (optionsBy) {
    const key = values[optionsBy.field];
    base = typeof key === "string" ? (optionsBy.map[key] ?? []) : [];
  }

  const rules = (field as { optionRules?: OptionRule[] }).optionRules;
  if (!rules || rules.length === 0) return base;
  const removed = new Set<string>();
  for (const rule of rules) {
    if ((rule.when ?? []).every((c) => conditionPasses(c, values))) {
      for (const opt of rule.removeOptions ?? []) removed.add(opt);
    }
  }
  return base.filter((opt) => !removed.has(opt));
}

// Lista de opções removidas agora (pra avisar o usuário "por que sumiu"
// — pedido explícito: "mostrar um aviso curto listando o que foi
// ocultado e por quê"), sem duplicar a lógica de effectiveOptions.
export function removedOptions(field: TemplateField, values: Record<string, unknown>): string[] {
  const rules = (field as { optionRules?: OptionRule[] }).optionRules;
  if (!rules || rules.length === 0) return [];
  const removed = new Set<string>();
  for (const rule of rules) {
    if ((rule.when ?? []).every((c) => conditionPasses(c, values))) {
      for (const opt of rule.removeOptions ?? []) removed.add(opt);
    }
  }
  return Array.from(removed);
}
