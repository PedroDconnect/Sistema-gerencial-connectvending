import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { fetchOperation } from "../../lib/operationApi";
import { activeMeta, formatDate, formatDateTime } from "../../services/operacaoCompletaService";
import { CustomerCrossReferencePanel } from "./CustomerCrossReferencePanel";

function PlainRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="drawer-field">
      <span className="drawer-field__label">{label}</span>
      <span className="drawer-field__value">{value}</span>
    </div>
  );
}

export function CustomerDetailDrawer({ customerId, onClose }) {
  const closeButtonRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!customerId) return undefined;
    let cancelled = false;
    setState({ loading: true, error: null, data: null });

    fetchOperation(`/customers/${customerId}`)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return undefined;
    closeButtonRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [customerId, onClose]);

  if (!customerId) return null;

  const customer = state.data;
  const meta = customer ? activeMeta(customer.active) : null;
  const equipments = customer?.equipments ?? [];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do cliente"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-panel__header">
          <div>
            <h2>Detalhes do Cliente</h2>
            <p>{customer?.name || (state.loading ? "Carregando..." : "Não informado")}</p>
          </div>
          <button type="button" className="icon-btn" ref={closeButtonRef} onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="drawer-panel__body">
          {state.loading && <div className="stat-tile--skeleton" style={{ height: 120, borderRadius: 12 }} />}

          {state.error && (
            <div className="state-error-block">
              <div>
                <strong>Não foi possível carregar os detalhes.</strong>
                <p>{state.error.message}</p>
              </div>
            </div>
          )}

          {customer && (
            <>
              <section className="drawer-section">
                <span className="drawer-section__eyebrow">Identificação</span>
                <PlainRow label="Nome" value={customer.name} />
                <PlainRow label="ID Auvo" value={String(customer.customerId)} />
                <div className="drawer-field">
                  <span className="drawer-field__label">Status</span>
                  <span className={`badge badge--${meta.variant}`}>{meta.label}</span>
                </div>
                <PlainRow label="CPF/CNPJ" value={customer.cpfCnpj} />
                <PlainRow label="Endereço" value={customer.address} />
                <PlainRow label="Telefone" value={customer.phone} />
                <PlainRow label="E-mail" value={customer.email} />
                <PlainRow label="Data de criação" value={formatDateTime(customer.creationDate)} />
                <PlainRow label="Última atualização" value={formatDateTime(customer.dateLastUpdate)} />
              </section>

              <section className="drawer-section">
                <span className="drawer-section__eyebrow">Máquinas deste cliente ({equipments.length})</span>
                {equipments.length === 0 && <p className="drawer-field__hint">Nenhuma máquina associada.</p>}
                {equipments.map((eq) => (
                  <div className="drawer-field" key={eq.equipmentId}>
                    <span className="drawer-field__label">
                      {eq.name || "Não informado"}
                      {eq.identifier ? ` — ${eq.identifier}` : ""}
                    </span>
                    <span className="drawer-field__value">{formatDate(eq.creationDate)}</span>
                  </div>
                ))}
              </section>

              <CustomerCrossReferencePanel auvoCustomerId={customer.customerId} customerName={customer.name} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
