// Espelha supabase/functions/preparations/service/fieldRules.ts — mesma
// lógica, duplicada porque o frontend não importa código do Deno. Usado
// pelo wizard (NewOrderWizard.jsx) pra mostrar/ocultar campo e filtrar
// opção em tempo real, igual o backend faz na validação/gravação
// (fonte da verdade real fica sempre no backend — isto aqui é só pra não
// mostrar um campo que o servidor vai rejeitar/descartar mesmo).
function conditionPasses(condition, values) {
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

export function isFieldVisible(field, values) {
  if (!field.visibleIf || field.visibleIf.length === 0) return true;
  return field.visibleIf.every((c) => conditionPasses(c, values));
}

export function effectiveOptions(field, values) {
  const base = field.options ?? [];
  if (!field.optionRules || field.optionRules.length === 0) return base;
  const removed = new Set();
  for (const rule of field.optionRules) {
    if ((rule.when ?? []).every((c) => conditionPasses(c, values))) {
      for (const opt of rule.removeOptions ?? []) removed.add(opt);
    }
  }
  return base.filter((opt) => !removed.has(opt));
}

// Campos visíveis pro merge de valores atual, já com as opções
// filtradas — helper único pra não repetir os dois passos em todo lugar
// que renderiza uma lista de campos do template.
export function visibleFieldsFor(fields, values) {
  return fields.filter((f) => isFieldVisible(f, values)).map((f) => ({ ...f, options: effectiveOptions(f, values) }));
}
