import { Fragment, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { DynamicFieldInput } from "./DynamicFieldInput";
import { CustomerSearchField } from "./CustomerSearchField";
import { useActivePreparationTemplate } from "../../hooks/useActivePreparationTemplate";
import { createPreparationOrder } from "../../lib/preparationsApi";
import { visibleFieldsFor, sanitizeValues, removedOptions } from "../../lib/preparationFieldRules";

const STEPS = ["customer", "quantity", "base", "forms", "review"];
const STEP_LABELS = {
  customer: "Cliente",
  quantity: "Quantidade",
  base: "Dados do pedido",
  forms: "Fichas",
  review: "Revisão",
};

function pad(n) {
  return String(n).padStart(2, "0");
}

// "Se a categoria escolhida tiver sistema de preparo = não, mostrar um
// aviso..." — derivado do próprio schema (não hardcoda Gabinete/Máquina
// de Gelo aqui): acha qualquer campo da seção "Preparo da bebida"
// condicionado a machine_category via "notIn" e reaproveita essa mesma
// lista, em vez de duplicar o critério em dois lugares.
function noPrepSystemCategories(fieldsAll) {
  const condField = fieldsAll.find((f) => (f.visibleIf ?? []).some((c) => c.field === "machine_category" && c.op === "notIn"));
  const condition = condField?.visibleIf?.find((c) => c.field === "machine_category" && c.op === "notIn");
  return Array.isArray(condition?.value) ? condition.value : [];
}

function formatSummaryValue(value) {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  return String(value);
}

// Ordem exata pedida no formulário definitivo pro "resumo ao vivo":
// Contrato, Cliente, Local interno, Modelo de negócio, Dias de
// abastecimento (só se visível), Categoria, Modelo, Acessórios, e — só
// se a seção "Preparo da bebida" estiver visível — Tipo de copo, Marca,
// Tipo do café, Produto e (se Locação + Dose) Valor da dose; por fim
// Observações. Usa os rótulos do próprio template (não hardcoded), pra
// acompanhar se o admin renomear um campo.
const SUMMARY_KEY_ORDER = [
  "contract_number",
  "customer_name",
  "business_model",
  "supply_days",
  "machine_category",
  "machine_model",
  "accessories",
  "cup_type",
  "product_brand",
  "coffee_type",
  "standard_layouts",
  "dose_value",
  "observations",
];

// "Local interno" tem coluna própria (form.internalLocation), não é uma
// chave de form_data — por isso entra à parte, logo depois de Cliente.
function buildFormSummary(form, fieldsAll, baseForm) {
  const merged = { ...baseForm, ...form.overrides };
  const visible = visibleFieldsFor(fieldsAll, merged);
  const visibleKeys = new Set(visible.map((f) => f.key));
  const fieldByKey = Object.fromEntries(fieldsAll.map((f) => [f.key, f]));

  const rows = [];
  for (const key of SUMMARY_KEY_ORDER) {
    if (key === "customer_name") {
      rows.push({ label: fieldByKey[key]?.label ?? "Cliente", value: formatSummaryValue(merged[key]) });
      rows.push({ label: "Local interno", value: formatSummaryValue(form.internalLocation) });
      continue;
    }
    if (!fieldByKey[key] || !visibleKeys.has(key)) continue;
    rows.push({ label: fieldByKey[key].label, value: formatSummaryValue(merged[key]) });
  }
  return rows;
}

async function copySummary(rows) {
  const text = rows.map((r) => `${r.label}: ${r.value}`).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Fluxo exato da spec (seção 4): cliente → quantidade → dados-base
// preenchidos 1 vez → campos por ficha (Local Interno + o que for
// perForm) → revisão → cria tudo (pedido + N fichas + tickets Auvo) numa
// chamada só (spec seção 11 — a ordem das etapas roda no backend).
export function NewOrderWizard({ onClose, onCreated }) {
  const { template, loading: templateLoading, error: templateError } = useActivePreparationTemplate();
  const [stepIndex, setStepIndex] = useState(0);
  const [customer, setCustomer] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [baseForm, setBaseForm] = useState({});
  const [sharedDefaults, setSharedDefaults] = useState({});
  const [forms, setForms] = useState([]); // [{ internalLocation, overrides, customized }]
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const step = STEPS[stepIndex];
  const fields = template?.schema?.fields ?? [];
  const baseFieldsAll = fields.filter((f) => !f.perForm);
  const perFormFieldsAll = fields.filter((f) => f.perForm && f.key !== "internal_location");
  // Addendum 02/09/2026 (spec seção 8): campo pode depender de outro
  // (ex.: "Preparo da bebida" só quando a Categoria da máquina tem
  // sistema de preparo) — recalculado a cada render com os valores atuais,
  // nunca uma lista fixa. baseFields usa só o que já foi preenchido no
  // próprio passo "Dados do pedido" (ainda não há ficha nenhuma aqui).
  const baseFields = visibleFieldsFor(baseFieldsAll, baseForm);

  // Redimensiona a lista de fichas quando a quantidade muda, preservando o
  // que já foi preenchido nas fichas que continuam existindo.
  useEffect(() => {
    setForms((prev) => {
      const next = [...prev];
      while (next.length < quantity) next.push({ internalLocation: "", overrides: { ...sharedDefaults }, customized: false });
      next.length = quantity;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity]);

  // Ficha que ainda não foi editada individualmente acompanha o valor
  // padrão compartilhado (spec 4.4: "replica a base pra N fichas, com
  // opção de editar individualmente").
  useEffect(() => {
    setForms((prev) => prev.map((f) => (f.customized ? f : { ...f, overrides: { ...sharedDefaults } })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedDefaults]);

  // "Se um item já estava marcado antes de uma mudança que o torna
  // inválido, desmarcar automaticamente" — só relevante quando o patch
  // mexe em overrides (ex.: trocou a Categoria da máquina), nunca em
  // internalLocation/customized.
  function sanitizeOverrides(overrides) {
    const merged = sanitizeValues(perFormFieldsAll, { ...baseForm, ...overrides });
    const next = {};
    for (const f of perFormFieldsAll) if (f.key in merged) next[f.key] = merged[f.key];
    return next;
  }

  function updateForm(index, patch) {
    setForms((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        const merged = { ...f, ...patch };
        if (patch.overrides) merged.overrides = sanitizeOverrides(patch.overrides);
        return merged;
      })
    );
  }

  function updateSharedDefault(key, value) {
    setSharedDefaults((prev) => {
      const next = { ...prev, [key]: value };
      const merged = sanitizeValues(perFormFieldsAll, { ...baseForm, ...next });
      const sanitized = {};
      for (const f of perFormFieldsAll) if (f.key in merged) sanitized[f.key] = merged[f.key];
      return sanitized;
    });
  }

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createPreparationOrder({
        customerId: customer.id,
        baseForm,
        forms: forms.map((f) => ({ internalLocation: f.internalLocation, overrides: f.overrides })),
      });
      onCreated(result);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const canGoNext =
    (step === "customer" && Boolean(customer)) ||
    (step === "quantity" && quantity >= 1) ||
    (step === "base" && baseFields.every((f) => !f.required || hasValue(baseForm[f.key]))) ||
    (step === "forms" && forms.every((f) => f.internalLocation.trim()));

  return (
    <div className="metric-modal-backdrop" onClick={onClose}>
      <div className="metric-modal-panel" role="dialog" aria-modal="true" aria-label="Novo pedido de preparação" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="metric-modal-panel__header">
          <div>
            <h2>Novo pedido de preparação</h2>
            <p>
              Passo {stepIndex + 1} de {STEPS.length} — {STEP_LABELS[step]}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="metric-modal-panel__body">
          {templateLoading && <div className="skeleton" style={{ height: 200 }} />}
          {templateError && (
            <div className="state-error-block">
              <div>
                <strong>Não foi possível carregar o template da ficha.</strong>
                <p>{templateError.message}</p>
              </div>
            </div>
          )}

          {template && step === "customer" && <CustomerSearchField value={customer} onSelect={setCustomer} />}

          {template && step === "quantity" && (
            <div className="form-field">
              <span className="form-field__label">Quantas fichas deseja criar?</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button type="button" className="btn btn--ghost" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                  −
                </button>
                <strong style={{ fontSize: 20, minWidth: 24, textAlign: "center" }}>{quantity}</strong>
                <button type="button" className="btn btn--ghost" onClick={() => setQuantity((q) => Math.min(20, q + 1))}>
                  +
                </button>
              </div>
              <span className="form-field__hint">Cada ficha vira 1 documento + 1 ticket próprio na Auvo.</span>
            </div>
          )}

          {template && step === "base" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p className="form-field__hint">Preenchido uma vez, compartilhado por todas as {quantity} ficha(s).</p>
              {baseFields.map((field) => (
                <label key={field.key} className="form-field">
                  <span className="form-field__label">
                    {field.label}
                    {field.required ? " *" : ""}
                  </span>
                  <DynamicFieldInput field={field} value={baseForm[field.key]} onChange={(v) => setBaseForm((prev) => ({ ...prev, [field.key]: v }))} />
                </label>
              ))}
            </div>
          )}

          {template && step === "forms" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {(() => {
                const sharedVisible = visibleFieldsFor(perFormFieldsAll, { ...baseForm, ...sharedDefaults });
                return (
                  sharedVisible.length > 0 && (
                    <div>
                      <p className="form-field__hint">Valor padrão pros campos abaixo (pode ser ajustado por ficha):</p>
                      {sharedVisible.map((field) => {
                        const hidden = removedOptions(field, { ...baseForm, ...sharedDefaults });
                        const noPrep = field.key === "machine_category" && noPrepSystemCategories(perFormFieldsAll).includes(sharedDefaults[field.key]);
                        return (
                          <label key={field.key} className="form-field" style={{ marginTop: 8 }}>
                            <span className="form-field__label">{field.label}</span>
                            <DynamicFieldInput field={field} value={sharedDefaults[field.key]} onChange={(v) => updateSharedDefault(field.key, v)} />
                            {hidden.length > 0 && (
                              <span className="form-field__hint">Ocultado agora: {hidden.join(", ")} (conforme categoria/modelo de negócio).</span>
                            )}
                            {noPrep && (
                              <span className="form-field__hint">Essa categoria não tem sistema de preparo — a seção "Preparo da bebida" fica oculta.</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )
                );
              })()}

              {forms.map((form, index) => {
                // Cada ficha pode ter Categoria da máquina diferente das
                // outras, então a visibilidade (ex.: Preparo da bebida) é
                // recalculada por ficha, com o merge base + valores dela.
                const formVisible = visibleFieldsFor(perFormFieldsAll, { ...baseForm, ...form.overrides });
                return (
                <div key={index} className="card" style={{ padding: 14 }}>
                  <strong>Ficha {pad(index + 1)}</strong>
                  <label className="form-field" style={{ marginTop: 8 }}>
                    <span className="form-field__label">Local Interno da Máquina *</span>
                    <input
                      className="form-field__input"
                      required
                      value={form.internalLocation}
                      onChange={(e) => updateForm(index, { internalLocation: e.target.value })}
                    />
                  </label>

                  {formVisible.length > 0 && !form.customized && (
                    <button type="button" className="link-btn" style={{ marginTop: 8 }} onClick={() => updateForm(index, { customized: true })}>
                      Editar ficha individualmente
                    </button>
                  )}
                  {formVisible.length > 0 && form.customized && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                      {formVisible.map((field) => {
                        const hidden = removedOptions(field, { ...baseForm, ...form.overrides });
                        const noPrep = field.key === "machine_category" && noPrepSystemCategories(perFormFieldsAll).includes(form.overrides[field.key]);
                        return (
                          <label key={field.key} className="form-field">
                            <span className="form-field__label">{field.label}</span>
                            <DynamicFieldInput
                              field={field}
                              value={form.overrides[field.key]}
                              onChange={(v) => updateForm(index, { overrides: { ...form.overrides, [field.key]: v } })}
                            />
                            {hidden.length > 0 && (
                              <span className="form-field__hint">Ocultado agora: {hidden.join(", ")} (conforme categoria/modelo de negócio).</span>
                            )}
                            {noPrep && (
                              <span className="form-field__hint">Essa categoria não tem sistema de preparo — a seção "Preparo da bebida" fica oculta.</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {template && step === "review" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p>
                <strong>{customer?.name}</strong> — {quantity} ficha(s)
              </p>
              {forms.map((form, index) => {
                const rows = buildFormSummary(form, fields, baseForm);
                return (
                  <div key={index} className="card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>Ficha {pad(index + 1)}</strong>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={async () => {
                          const ok = await copySummary(rows);
                          setCopiedIndex(ok ? index : null);
                          if (ok) setTimeout(() => setCopiedIndex((i) => (i === index ? null : i)), 2000);
                        }}
                      >
                        {copiedIndex === index ? "Copiado!" : "Copiar resumo"}
                      </button>
                    </div>
                    <dl style={{ marginTop: 8, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13 }}>
                      {rows.map((row) => (
                        <Fragment key={row.label}>
                          <dt style={{ color: "var(--text-muted)" }}>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  </div>
                );
              })}
              {submitError && <span className="form-field__error">{submitError.message}</span>}
            </div>
          )}
        </div>

        <div className="admin-users__actions" style={{ padding: "0 24px 20px" }}>
          {stepIndex > 0 && (
            <button type="button" className="btn btn--ghost" onClick={goBack} disabled={submitting}>
              Voltar
            </button>
          )}
          {step !== "review" && (
            <button type="button" className="btn btn--primary" onClick={goNext} disabled={!canGoNext}>
              Continuar
            </button>
          )}
          {step === "review" && (
            <button type="button" className="btn btn--primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Criando pedido…" : "Finalizar e abrir pedidos"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
