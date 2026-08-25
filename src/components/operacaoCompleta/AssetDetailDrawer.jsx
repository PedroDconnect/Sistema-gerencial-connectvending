import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { fetchOperation } from "../../lib/operationApi";
import { activeMeta, formatDateTime } from "../../services/operacaoCompletaService";
import { MachineConsumptionPanel } from "./MachineConsumptionPanel";

function PlainRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="drawer-field">
      <span className="drawer-field__label">{label}</span>
      <span className="drawer-field__value">{value}</span>
    </div>
  );
}

export function AssetDetailDrawer({ equipmentId, onClose }) {
  const closeButtonRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!equipmentId) return undefined;
    let cancelled = false;
    setState({ loading: true, error: null, data: null });

    fetchOperation(`/assets/${equipmentId}`)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [equipmentId]);

  useEffect(() => {
    if (!equipmentId) return undefined;
    closeButtonRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [equipmentId, onClose]);

  if (!equipmentId) return null;

  const asset = state.data;
  const meta = asset ? activeMeta(asset.equipmentActive) : null;
  const specs = Array.isArray(asset?.equipmentSpecifications) ? asset.equipmentSpecifications : [];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes da máquina"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-panel__header">
          <div>
            <h2>Detalhes da Máquina</h2>
            <p>{asset?.equipmentName || (state.loading ? "Carregando..." : "Não informado")}</p>
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

          {asset && (
            <>
              {asset.customerName && (
                <section className="drawer-section drawer-section--highlight">
                  <span className="drawer-section__eyebrow">Cliente</span>
                  <h3 className="drawer-client-name">{asset.customerName}</h3>
                  <div className="drawer-client-meta">
                    <span>ID Auvo: {asset.customerId}</span>
                    {asset.city && <span>Cidade: {asset.city}</span>}
                    {asset.state && <span>Estado: {asset.state}</span>}
                  </div>
                </section>
              )}
              {!asset.customerName && (
                <div className="state-warning-block">
                  <strong>Sem cliente associado.</strong>
                </div>
              )}

              <MachineConsumptionPanel equipmentId={asset.equipmentId} />

              <section className="drawer-section">
                <span className="drawer-section__eyebrow">Identificação</span>
                <PlainRow label="Nome" value={asset.equipmentName} />
                <PlainRow label="Identifier" value={asset.identifier} />
                {/* Local interno (ex.: "5º andar", "recepção") — a Auvo não
                    tem um campo dedicado pra isso, então usamos o próprio
                    "description" do equipamento. Sempre visível (com
                    fallback), mesmo antes de ser preenchido, pra já deixar
                    claro onde esse dado vai aparecer daqui pra frente. */}
                <PlainRow label="Descrição / Local interno" value={asset.description || "Não informado"} />
                <PlainRow label="ID Auvo" value={String(asset.equipmentId)} />
                <div className="drawer-field">
                  <span className="drawer-field__label">Status</span>
                  <span className={`badge badge--${meta.variant}`}>{meta.label}</span>
                </div>
                <PlainRow label="Categoria (ID)" value={asset.categoryId ? String(asset.categoryId) : null} />
                <PlainRow label="Data de criação" value={formatDateTime(asset.creationDate)} />
              </section>

              <section className="drawer-section">
                <span className="drawer-section__eyebrow">Garantia</span>
                <PlainRow label="Expiração" value={formatDateTime(asset.expirationDate)} />
                <PlainRow label="Início da garantia" value={formatDateTime(asset.warrantyStartDate)} />
                <PlainRow label="Fim da garantia" value={formatDateTime(asset.warrantyEndDate)} />
              </section>

              {specs.length > 0 && (
                <section className="drawer-section">
                  <span className="drawer-section__eyebrow">Especificações</span>
                  {specs.map((spec, i) => (
                    <PlainRow key={i} label={spec.name ?? `Item ${i + 1}`} value={spec.value ?? spec.description} />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
