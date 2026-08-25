import { useEffect, useRef } from "react";
import { Icon } from "../Icon";
import { MACHINE_STATUS_META, formatDateTime, formatRssi, formatCarrier } from "../../services/vmpayService";

function PlainRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="drawer-field">
      <span className="drawer-field__label">{label}</span>
      <span className="drawer-field__value">{value}</span>
    </div>
  );
}

export function MachineDetailDrawer({ machine, windowHours, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!machine) return undefined;
    closeButtonRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [machine, onClose]);

  if (!machine) return null;

  const meta = MACHINE_STATUS_META[machine.status] ?? MACHINE_STATUS_META.data_unavailable;

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
            <h2>Máquina {machine.assetNumber}</h2>
            <p>ID {machine.machineId}</p>
          </div>
          <button type="button" className="icon-btn" ref={closeButtonRef} onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="drawer-panel__body">
          {machine.locationName && (
            <section className="drawer-section drawer-section--highlight">
              <span className="drawer-section__eyebrow">Cliente</span>
              <h3 className="drawer-client-name">{machine.locationName}</h3>
              <div className="drawer-client-meta">
                <span>{machine.place || "Local não informado"}</span>
              </div>
            </section>
          )}

          <section className="drawer-section">
            <span className="drawer-section__eyebrow">Identificação</span>
            <PlainRow label="Modelo" value={machine.machineModelId} />
            <PlainRow label="Tags" value={machine.tags?.length ? machine.tags.join(", ") : null} />
            <div className="drawer-field">
              <span className="drawer-field__label">Status</span>
              <span className={`badge badge--${meta.variant}`}>
                {meta.emoji} {meta.label}
              </span>
            </div>
          </section>

          <section className="drawer-section">
            <span className="drawer-section__eyebrow">Doses ({windowHours ? `últimas ${windowHours}h` : "período monitorado"})</span>
            <PlainRow label="Última dose" value={formatDateTime(machine.lastVendAt)} />
            <PlainRow label="Doses no período" value={machine.vendCountLast2Hours.toLocaleString("pt-BR")} />
            <PlainRow label="Quantidade total" value={machine.quantityLast2Hours.toLocaleString("pt-BR")} />
          </section>

          <section className="drawer-section">
            <span className="drawer-section__eyebrow">Comunicação</span>
            <PlainRow label="Última comunicação" value={formatDateTime(machine.lastCommunicationAt)} />
            <PlainRow label="Sinal (RSSI)" value={formatRssi(machine.connection?.rssi)} />
            <PlainRow label="Operadora" value={formatCarrier(machine.connection)} />
            <PlainRow label="Status operacional (VMpay)" value={machine.operationStatus} />
            <PlainRow label="Sinalizações" value={machine.states?.length ? machine.states.join(", ") : null} />
          </section>
        </div>
      </aside>
    </div>
  );
}
