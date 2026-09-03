import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { CustomerSearchField } from "./CustomerSearchField";
import { fetchTicketRequestTypes, createTechnicalVisit } from "../../lib/preparationsApi";

// "Solicitar Visita Técnica" (spec seção 4.1 — segunda opção do
// "+ Abrir chamado", nunca detalhada no resto da spec). Fluxo bem mais
// simples que o de Pedido de Preparação: ticket direto na Auvo, sem
// ficha, sem PDF, sem pedido — só cliente, tipo de solicitação, título e
// descrição.
export function TechnicalVisitModal({ onClose, onCreated }) {
  const [customer, setCustomer] = useState(null);
  const [requestTypes, setRequestTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typesError, setTypesError] = useState(null);
  const [requestTypeId, setRequestTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    fetchTicketRequestTypes()
      .then((data) => setRequestTypes(data?.items ?? []))
      .catch((err) => setTypesError(err))
      .finally(() => setLoadingTypes(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createTechnicalVisit({
        customerId: customer.id,
        requestTypeId: Number(requestTypeId),
        title,
        description,
      });
      onCreated(result);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = customer && requestTypeId && title.trim();

  return (
    <div className="metric-modal-backdrop" onClick={onClose}>
      <div className="metric-modal-panel" role="dialog" aria-modal="true" aria-label="Solicitar visita técnica" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="metric-modal-panel__header">
          <div>
            <h2>Solicitar visita técnica</h2>
            <p>Abre um chamado direto na Auvo — sem ficha nem documento.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 24px 24px" }}>
          <CustomerSearchField value={customer} onSelect={setCustomer} />

          <label className="form-field">
            <span className="form-field__label">Tipo de solicitação</span>
            {typesError && <span className="form-field__error">{typesError.message}</span>}
            <select
              className="form-field__input"
              required
              value={requestTypeId}
              onChange={(e) => setRequestTypeId(e.target.value)}
              disabled={loadingTypes}
            >
              <option value="">{loadingTypes ? "Carregando…" : "Selecione…"}</option>
              {requestTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="form-field__label">Título *</span>
            <input className="form-field__input" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="form-field">
            <span className="form-field__label">Descrição</span>
            <textarea className="form-field__input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          {submitError && <span className="form-field__error">{submitError.message}</span>}

          <div className="admin-users__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={!canSubmit || submitting}>
              {submitting ? "Abrindo…" : "Abrir chamado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
