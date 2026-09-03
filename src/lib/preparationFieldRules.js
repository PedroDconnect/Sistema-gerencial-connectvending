// Espelha supabase/functions/preparations/service/fieldRules.ts — mesma
// lógica, duplicada porque o frontend não importa código do Deno. Usado
// pelo wizard (NewOrderWizard.jsx) pra mostrar/ocultar campo, trocar
// opções em cascata e filtrar opção em tempo real, igual o backend faz
// na validação/gravação (fonte da verdade real fica sempre no backend —
// isto aqui é só pra não mostrar um campo que o servidor vai
// rejeitar/descartar mesmo).
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
    case "contains":
      return Array.isArray(actual) && actual.includes(condition.value);
    default:
      return true;
  }
}

export function isFieldVisible(field, values) {
  if (!field.visibleIf || field.visibleIf.length === 0) return true;
  return field.visibleIf.every((c) => conditionPasses(c, values));
}

// optionsBy troca a lista inteira conforme outro campo (cascata, ex.:
// Modelo depende da Categoria) — sem valor na fonte, lista vazia (campo
// fica sem opção até a categoria ser escolhida). optionRules remove
// opção específica da lista já resolvida.
export function effectiveOptions(field, values) {
  let base = field.options ?? [];
  if (field.optionsBy) {
    const key = values[field.optionsBy.field];
    base = typeof key === "string" ? field.optionsBy.map[key] ?? [] : [];
  }
  if (!field.optionRules || field.optionRules.length === 0) return base;
  const removed = new Set();
  for (const rule of field.optionRules) {
    if ((rule.when ?? []).every((c) => conditionPasses(c, values))) {
      for (const opt of rule.removeOptions ?? []) removed.add(opt);
    }
  }
  return base.filter((opt) => !removed.has(opt));
}

// Pra mostrar "por que essa opção sumiu" perto do campo.
export function removedOptions(field, values) {
  if (!field.optionRules || field.optionRules.length === 0) return [];
  const removed = new Set();
  for (const rule of field.optionRules) {
    if ((rule.when ?? []).every((c) => conditionPasses(c, values))) {
      for (const opt of rule.removeOptions ?? []) removed.add(opt);
    }
  }
  return Array.from(removed);
}

// Campos visíveis pro merge de valores atual, já com as opções
// filtradas — helper único pra não repetir os passos em todo lugar que
// renderiza uma lista de campos do template.
export function visibleFieldsFor(fields, values) {
  return fields.filter((f) => isFieldVisible(f, values)).map((f) => ({ ...f, options: effectiveOptions(f, values) }));
}

// "Se um item já estava marcado antes de uma mudança que o torna
// inválido, desmarcar automaticamente" — recalcula o valor de cada campo
// visível contra as opções efetivas atuais, descartando seleção que não
// é mais válida (single_select vira "", multi_select perde só o item
// inválido). Chamado sempre que um valor que afeta opção de outro campo
// muda (Categoria, Modelo de negócio).
export function sanitizeValues(fields, values) {
  const next = { ...values };
  for (const field of fields) {
    if (!isFieldVisible(field, next)) continue;
    if (field.type !== "single_select" && field.type !== "multi_select") continue;
    const options = effectiveOptions(field, next);
    const current = next[field.key];
    if (field.type === "single_select") {
      if (current && !options.includes(current)) next[field.key] = "";
    } else if (Array.isArray(current)) {
      const filtered = current.filter((v) => options.includes(v));
      if (filtered.length !== current.length) next[field.key] = filtered;
    }
  }
  return next;
}
