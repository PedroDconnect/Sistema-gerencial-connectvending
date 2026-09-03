import { Icon } from "../Icon";

// "+ Abrir chamado" → "O que deseja fazer?" (spec seção 4.1) — os dois
// caminhos divergem bastante depois daqui (Visita Técnica é 1 ticket
// direto; Pedido de Preparação é N fichas + PDF + N tickets), por isso um
// chooser em vez de um só botão.
export function OpenTicketChooser({ onClose, onChooseVisit, onChooseOrder }) {
  return (
    <div className="metric-modal-backdrop" onClick={onClose}>
      <div className="metric-modal-panel" role="dialog" aria-modal="true" aria-label="O que deseja fazer?" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="metric-modal-panel__header">
          <div>
            <h2>O que deseja fazer?</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 24px 24px" }}>
          <button type="button" className="btn btn--ghost" style={{ justifyContent: "flex-start", height: 48 }} onClick={onChooseVisit}>
            <Icon name="truck" size={16} />
            Solicitar Visita Técnica
          </button>
          <button type="button" className="btn btn--primary" style={{ justifyContent: "flex-start", height: 48 }} onClick={onChooseOrder}>
            <Icon name="clipboard" size={16} />
            Pedido de Preparação
          </button>
        </div>
      </div>
    </div>
  );
}
