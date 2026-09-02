import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { DynamicFieldInput } from "./DynamicFieldInput";
import { CustomerSearchField } from "./CustomerSearchField";
import { useActivePreparationTemplate } from "../../hooks/useActivePreparationTemplate";
import { createPreparationOrder } from "../../lib/preparationsApi";

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

  const step = STEPS[stepIndex];
  const fields = template?.schema?.fields ?? [];
  const baseFields = fields.filter((f) => !f.perForm);
  const perFormFields = fields.filter((f) => f.perForm && f.key !== "internal_location");

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

  function updateForm(index, patch) {
    setForms((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
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
              {perFormFields.length > 0 && (
                <div>
                  <p className="form-field__hint">Valor padrão pros campos abaixo (pode ser ajustado por ficha):</p>
                  {perFormFields.map((field) => (
                    <label key={field.key} className="form-field" style={{ marginTop: 8 }}>
                      <span className="form-field__label">{field.label}</span>
                      <DynamicFieldInput field={field} value={sharedDefaults[field.key]} onChange={(v) => setSharedDefaults((prev) => ({ ...prev, [field.key]: v }))} />
                    </label>
                  ))}
                </div>
              )}

              {forms.map((form, index) => (
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

                  {perFormFields.length > 0 && !form.customized && (
                    <button type="button" className="link-btn" style={{ marginTop: 8 }} onClick={() => updateForm(index, { customized: true })}>
                      Editar ficha individualmente
                    </button>
                  )}
                  {perFormFields.length > 0 && form.customized && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                      {perFormFields.map((field) => (
                        <label key={field.key} className="form-field">
                          <span className="form-field__label">{field.label}</span>
                          <DynamicFieldInput
                            field={field}
                            value={form.overrides[field.key]}
                            onChange={(v) => updateForm(index, { overrides: { ...form.overrides, [field.key]: v } })}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {template && step === "review" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p>
                <strong>{customer?.name}</strong> — {quantity} ficha(s)
              </p>
              <ul className="metric-modal__customer-list">
                {forms.map((form, index) => (
                  <li key={index} className="metric-modal__customer" style={{ padding: "8px 10px" }}>
                    Ficha {pad(index + 1)} — {form.internalLocation}
                  </li>
                ))}
              </ul>
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
