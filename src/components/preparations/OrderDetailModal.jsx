import { useState } from "react";
import { Icon } from "../Icon";
import { usePreparationOrder } from "../../hooks/usePreparationOrder";
import { retryPreparationForm, syncPreparationOrderWithAuvo, getPreparationFormDocumentUrl } from "../../lib/preparationsApi";

const STATUS_LABEL = {
  DRAFT: "Rascunho",
  READY: "Pronta",
  GENERATING_DOCUMENT: "Gerando documento",
  CREATING_TICKET: "Criando ticket",
  SENT_TO_AUVO: "Enviada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
  ERROR: "Erro",
};

const ORDER_STATUS_LABEL = {
  DRAFT: "Rascunho",
  PROCESSING: "Processando",
  PARTIALLY_SENT: "Parcialmente enviado",
  SENT: "Enviado",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
  ERROR: "Erro",
  CANCELLED: "Cancelado",
};

function statusBadgeVariant(status) {
  if (status === "ERROR") return "danger";
  if (status === "SENT_TO_AUVO" || status === "COMPLETED" || status === "SENT") return "success";
  if (status === "PARTIALLY_SENT") return "warning";
  return "neutral";
}

function pad(n) {
  return String(n).padStart(2, "0");
}

export function OrderDetailModal({ orderId, onClose }) {
  const { loading, error, data, refetch } = usePreparationOrder(orderId);
  const [busyFormId, setBusyFormId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function handleRetry(formId) {
    setBusyFormId(formId);
    setActionError(null);
    try {
      await retryPreparationForm(orderId, formId);
      refetch();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusyFormId(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setActionError(null);
    try {
      await syncPreparationOrderWithAuvo(orderId);
      refetch();
    } catch (err) {
      setActionError(err);
    } finally {
      setSyncing(false);
    }
  }

  async function handleViewDocument(formId) {
    setActionError(null);
    try {
      const { url } = await getPreparationFormDocumentUrl(orderId, formId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <div className="metric-modal-backdrop" onClick={onClose}>
      <div className="metric-modal-panel" role="dialog" aria-modal="true" aria-label="Detalhe do pedido" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="metric-modal-panel__header">
          <div>
            <h2>{data?.code ?? "Pedido"}</h2>
            {data && (
              <p>
                {data.customerName} — {data.formCount} ficha(s) ·{" "}
                <span className={`badge badge--${statusBadgeVariant(data.status)}`}>{ORDER_STATUS_LABEL[data.status] ?? data.status}</span>
              </p>
            )}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="metric-modal-panel__body">
          {loading && <div className="skeleton" style={{ height: 200 }} />}
          {error && (
            <div className="state-error-block">
              <div>
                <strong>Não foi possível carregar o pedido.</strong>
                <p>{error.message}</p>
              </div>
            </div>
          )}
          {actionError && (
            <div className="state-error-block" style={{ marginBottom: 12 }}>
              <div>
                <strong>Não foi possível completar a ação.</strong>
                <p>{actionError.message}</p>
              </div>
            </div>
          )}

          {data && (
            <>
              <div className="admin-users__actions" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
                <button type="button" className="btn btn--ghost" onClick={handleSync} disabled={syncing}>
                  <Icon name="refresh" size={14} />
                  {syncing ? "Atualizando…" : "Atualizar Auvo"}
                </button>
              </div>

              <ul className="metric-modal__customer-list">
                {data.forms.map((form) => (
                  <li key={form.id} className="metric-modal__customer" style={{ padding: "12px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div>
                        <strong>
                          Ficha {pad(form.sequence)} — {form.internalLocation}
                        </strong>
                        <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span className={`badge badge--${statusBadgeVariant(form.status)}`}>{STATUS_LABEL[form.status] ?? form.status}</span>
                          {form.auvoTicketId && (
                            <span className="form-field__hint">
                              Auvo: Ticket #{form.auvoTicketId}
                              {form.auvoTicketStatusName ? ` — ${form.auvoTicketStatusName}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="admin-users__actions">
                        {form.documentPath && (
                          <button type="button" className="btn btn--ghost" onClick={() => handleViewDocument(form.id)}>
                            Ver ficha
                          </button>
                        )}
                        {form.status === "ERROR" && (
                          <button type="button" className="btn btn--primary" onClick={() => handleRetry(form.id)} disabled={busyFormId === form.id}>
                            {busyFormId === form.id ? "Tentando…" : "Tentar novamente"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
