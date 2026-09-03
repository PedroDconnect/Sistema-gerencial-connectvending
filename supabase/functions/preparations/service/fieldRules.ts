import { TemplateField } from "./pdfService.ts";

export interface FieldCondition {
  field: string;
  op: "eq" | "neq" | "in" | "notIn";
  value: unknown;
}

export interface OptionRule {
  when: FieldCondition[];
  removeOptions: string[];
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
    default:
      return true;
  }
}

// visibleIf/optionRules (addendum 02/09/2026): a seção "Preparo da
// bebida" só existe pra categorias de máquina com sistema de preparo, e
// dentro dela Layout padrão/Valor da dose só quando Modelo de negócio =
// "Locação + Dose" — motor genérico (lido do JSON do template, nunca
// hardcoded em código) pra caber qualquer regra nova que o admin
// configure depois pela tela de configuração da ficha. "values" é sempre
// o merge base+ficha já resolvido por quem chama — a mesma função serve
// tanto o wizard (frontend, duplicada em preparationFieldRules.js) quanto
// a geração do PDF.
export function isFieldVisible(field: TemplateField, values: Record<string, unknown>): boolean {
  const conditions = (field as { visibleIf?: FieldCondition[] }).visibleIf;
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => conditionPasses(c, values));
}

// Ex.: "Acessórios" sempre aparece, mas algumas opções somem conforme
// Modelo de negócio/Categoria (spec seção 8, árvore de decisão de
// Acessórios) — diferente de visibleIf, que esconde o CAMPO inteiro.
export function effectiveOptions(field: TemplateField, values: Record<string, unknown>): string[] {
  const base = field.options ?? [];
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
