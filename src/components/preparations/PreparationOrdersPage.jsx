import { useState } from "react";
import { Icon } from "../Icon";
import { usePreparationOrders } from "../../hooks/usePreparationOrders";
import { NewOrderWizard } from "./NewOrderWizard";
import { OrderDetailModal } from "./OrderDetailModal";

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
  if (status === "SENT" || status === "COMPLETED") return "success";
  if (status === "PARTIALLY_SENT" || status === "IN_PROGRESS") return "warning";
  return "neutral";
}

// Tela principal do módulo (spec seção 13.1): tabela Pedido/Cliente/
// Fichas/Tickets/Status + "+ Novo Pedido" abrindo o wizard.
export function PreparationOrdersPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { loading, error, items, total, refetch } = usePreparationOrders(page, pageSize);
  const [showWizard, setShowWizard] = useState(false);
  const [openOrderId, setOpenOrderId] = useState(null);

  return (
    <main className="main">
      <header className="topbar">
        <div>
          <h1 className="topbar__title">Pedidos de Preparação</h1>
          <p className="topbar__subtitle">Cada ficha do pedido vira 1 documento + 1 ticket próprio na Auvo.</p>
        </div>
        <div className="topbar__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowWizard(true)}>
            <Icon name="clipboard" size={16} />
            Novo pedido
          </button>
        </div>
      </header>

      {error && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar os pedidos.</strong>
            <p>{error.message}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={refetch}>
            Tentar novamente
          </button>
        </div>
      )}

      <section className="card">
        {loading ? (
          <div className="skeleton" style={{ height: 200, marginTop: 14 }} />
        ) : items.length === 0 ? (
          <div className="state-empty" style={{ height: 100 }}>
            Nenhum pedido ainda.
          </div>
        ) : (
          <div className="ativos-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th className="num">Fichas</th>
                  <th className="num">Tickets</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr key={order.id} onClick={() => setOpenOrderId(order.id)} style={{ cursor: "pointer" }}>
                    <td className="k">{order.code}</td>
                    <td>{order.customerName ?? "—"}</td>
                    <td className="num">{order.formCount}</td>
                    <td className="num">
                      {order.ticketsCreated}/{order.formCount}
                    </td>
                    <td>
                      <span className={`badge badge--${statusBadgeVariant(order.status)}`}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {total > pageSize && (
        <div className="ativos-pagination">
          <button type="button" className="btn btn--ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Anterior
          </button>
          <span className="form-field__hint">
            Página {page} de {Math.ceil(total / pageSize)}
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => setPage((p) => p + 1)} disabled={page * pageSize >= total}>
            Próxima
          </button>
        </div>
      )}

      {showWizard && (
        <NewOrderWizard
          onClose={() => setShowWizard(false)}
          onCreated={(order) => {
            setShowWizard(false);
            refetch();
            setOpenOrderId(order.id);
          }}
        />
      )}

      {openOrderId && <OrderDetailModal orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}
    </main>
  );
}
