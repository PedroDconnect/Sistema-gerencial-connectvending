import { useState } from "react";
import { useCustomerPanel } from "../../hooks/useCustomerPanel";
import { formatDayOnly, formatSyncTime } from "../../services/operacaoCompletaService";
import { CustomerPanelDetailModal } from "./CustomerPanelDetailModal";

export function CustomerCrossReferencePanel({ auvoCustomerId, customerName }) {
  const { loading, error, data } = useCustomerPanel(auvoCustomerId);
  const [detailOpen, setDetailOpen] = useState(false);

  if (loading) {
    return (
      <section className="drawer-section">
        <span className="drawer-section__eyebrow">Consumo e chamados</span>
        <div className="stat-tile--skeleton" style={{ height: 120, borderRadius: 12, marginTop: 8 }} />
      </section>
    );
  }

  if (error) {
    return (
      <section className="drawer-section">
        <span className="drawer-section__eyebrow">Consumo e chamados</span>
        <div className="state-error-block" style={{ marginTop: 8 }}>
          <div>
            <strong>Não foi possível carregar o cruzamento.</strong>
            <p>{error.message}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const { consumption, tasks } = data;
  const machinesWithConsumption = (consumption.machines ?? []).filter((m) => m.quantity > 0);
  const unmatchedCount = (consumption.machines ?? []).filter((m) => m.matchStatus === "NOT_FOUND" || m.matchStatus === "DUPLICATE").length;

  return (
    <>
      <section className="drawer-section">
        <div className="customer-panel-summary__header">
          <span className="drawer-section__eyebrow">Consumo VMpay (últimos 7 dias)</span>
          <button type="button" className="link-btn" onClick={() => setDetailOpen(true)}>
            Ver detalhado
          </button>
        </div>
        <div className="consumption-panel__totals">
          <div className="stat-tile">
            <div className="stat-tile__label">Doses no período</div>
            <div className="stat-tile__value num">{consumption.totalQuantity.toLocaleString("pt-BR")}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">Vendas no período</div>
            <div className="stat-tile__value num">{consumption.totalSales.toLocaleString("pt-BR")}</div>
          </div>
        </div>

        {unmatchedCount > 0 && (
          <p className="drawer-field__hint">
            {unmatchedCount} de {consumption.machines.length} máquinas deste cliente não casaram com a VMpay — consumo delas não entra
            no total.
          </p>
        )}

        {machinesWithConsumption.length > 0 && (
          <div className="consumption-panel__by-product">
            <span className="drawer-field__hint">Consumo por máquina</span>
            {machinesWithConsumption
              .sort((a, b) => b.quantity - a.quantity)
              .map((m) => (
                <div className="drawer-field" key={m.auvoEquipmentId}>
                  <span className="drawer-field__label">
                    {m.name || "Não informado"} ({m.identifier || "—"})
                  </span>
                  <span className="drawer-field__value">{m.quantity.toLocaleString("pt-BR")} doses</span>
                </div>
              ))}
          </div>
        )}

        {consumption.totalQuantity === 0 && (
          <p className="drawer-field__hint">Nenhuma venda registrada nas máquinas casadas deste cliente no período.</p>
        )}
      </section>

      <section className="drawer-section">
        <span className="drawer-section__eyebrow">Chamados Auvo ({formatDayOnly(tasks.dateFrom)} – {formatDayOnly(tasks.dateTo)})</span>

        {tasks.tasksSyncStatus === "error" && (
          <div className="state-warning-block" style={{ marginBottom: 10 }}>
            <strong>A última sincronização de chamados apresentou erro.</strong>
            <p>Os números abaixo são da última sincronização válida.</p>
          </div>
        )}

        {tasks.byType.map((t) => (
          <div className="drawer-field" key={t.taskTypeName}>
            <span className="drawer-field__label">{t.taskTypeName}</span>
            <span className="drawer-field__value">
              {t.total.toLocaleString("pt-BR")} {t.total > 0 && `(${t.finished} concluído${t.finished === 1 ? "" : "s"})`}
            </span>
          </div>
        ))}

        <p className="drawer-field__hint">Chamados atualizados em: {formatSyncTime(tasks.tasksSyncedAt)}</p>
      </section>

      {detailOpen && (
        <CustomerPanelDetailModal
          auvoCustomerId={auvoCustomerId}
          customerName={customerName}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}
