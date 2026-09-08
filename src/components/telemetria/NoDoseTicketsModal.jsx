import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { fetchTicketRequestTypes, createNoDoseTickets } from "../../lib/preparationsApi";
import { formatDateTime } from "../../services/vmpayService";

// "Rodar análise" (pedido do usuário, 08/09/2026): abre 1 chamado Auvo por
// máquina sem doses — em massa (tudo pré-selecionado) ou por seleção
// manual (desmarca o que não quer). "Pode ser sem cliente vinculado" —
// o backend cruza patrimônio × Auvo por conta própria e abre o chamado
// mesmo sem achar cliente, então aqui não há campo de cliente nenhum.
export function NoDoseTicketsModal({ machines, onClose }) {
  const [selected, setSelected] = useState(() => new Set(machines.map((m) => m.machineId)));
  const [requestTypes, setRequestTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typesError, setTypesError] = useState(null);
  const [requestTypeId, setRequestTypeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [results, setResults] = useState(null);

  useEffect(() => {
    fetchTicketRequestTypes()
      .then((data) => setRequestTypes(data?.items ?? []))
      .catch((err) => setTypesError(err))
      .finally(() => setLoadingTypes(false));
  }, []);

  const resultByMachineId = useMemo(() => {
    if (!results) return null;
    const map = new Map();
    for (const r of results) map.set(r.machineId, r);
    return map;
  }, [results]);

  function toggle(machineId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(machineId)) next.delete(machineId);
      else next.add(machineId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(machines.map((m) => m.machineId)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const chosen = machines.filter((m) => selected.has(m.machineId));
      const payload = {
        requestTypeId: Number(requestTypeId),
        machines: chosen.map((m) => ({
          assetNumber: m.assetNumber ?? null,
          machineId: m.machineId,
          locationName: m.locationName ?? null,
          place: m.place ?? null,
          lastCommunicationAt: m.lastCommunicationAt ?? null,
          lastVendAt: m.lastVendAt ?? null,
        })),
      };
      const response = await createNoDoseTickets(payload);
      setResults(response?.items ?? []);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = selected.size > 0 && requestTypeId;
  const okCount = results ? results.filter((r) => r.ok).length : 0;
  const failCount = results ? results.length - okCount : 0;

  return (
    <div className="metric-modal-backdrop" onClick={onClose}>
      <div
        className="metric-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Rodar análise — máquinas sem doses"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <div className="metric-modal-panel__header">
          <div>
            <h2>Rodar análise — máquinas sem doses</h2>
            <p>Abre 1 chamado na Auvo para cada máquina selecionada abaixo.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Painel inteiro tem max-height:85vh + overflow:hidden (App.css) —
            header fixo acima, footer fixo abaixo, só o meio rola. Sem isso
            a lista de 100+ máquinas empurra os botões "Abrir chamados"/
            "Cancelar" pra fora da área visível (bug reportado 08/09/2026). */}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}
        >
          <div
            className="metric-modal-panel__body"
            style={{ display: "flex", flexDirection: "column", gap: 14, flex: "1 1 auto", minHeight: 0 }}
          >
            {!results && (
              <>
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

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="form-field__label" style={{ margin: 0 }}>
                    {selected.size} de {machines.length} máquinas selecionadas
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn btn--ghost" onClick={selectAll}>
                      Selecionar todas
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={clearAll}>
                      Limpar seleção
                    </button>
                  </div>
                </div>

                <div className="ativos-table-wrap" style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
                  <table className="data-table ativos-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}></th>
                        <th>Asset</th>
                        <th>Cliente/Local</th>
                        <th>Última comunicação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {machines.map((m) => (
                        <tr key={m.machineId} onClick={() => toggle(m.machineId)} style={{ cursor: "pointer" }}>
                          <td>
                            <input type="checkbox" checked={selected.has(m.machineId)} onChange={() => toggle(m.machineId)} onClick={(e) => e.stopPropagation()} />
                          </td>
                          <td className="num">{m.assetNumber || `#${m.machineId}`}</td>
                          <td className="ativos-table__truncate" title={m.locationName || undefined}>
                            {m.locationName || <span className="ativos-table__muted">—</span>}
                          </td>
                          <td className="num">{formatDateTime(m.lastCommunicationAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {submitError && <span className="form-field__error">{submitError.message}</span>}
              </>
            )}

            {results && (
              <>
                <div className="state-warning-block" style={{ borderColor: failCount > 0 ? undefined : "transparent" }}>
                  <strong>
                    {okCount} chamado{okCount === 1 ? "" : "s"} criado{okCount === 1 ? "" : "s"}
                    {failCount > 0 ? `, ${failCount} falharam` : ""}.
                  </strong>
                </div>

                <div className="ativos-table-wrap" style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
                  <table className="data-table ativos-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Resultado</th>
                        <th>Cliente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {machines
                        .filter((m) => resultByMachineId?.has(m.machineId))
                        .map((m) => {
                          const r = resultByMachineId.get(m.machineId);
                          return (
                            <tr key={m.machineId}>
                              <td className="num">{m.assetNumber || `#${m.machineId}`}</td>
                              <td>
                                {r.ok ? (
                                  <span className="badge badge--success">Ticket #{r.ticketId}</span>
                                ) : (
                                  <span className="badge badge--danger" title={r.error}>
                                    Falhou
                                  </span>
                                )}
                              </td>
                              <td>{r.matchedCustomer ? "Identificado" : "Não identificado"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="admin-users__actions" style={{ padding: "12px 20px", borderTop: "1px solid var(--border-hairline)", flex: "0 0 auto" }}>
            {!results ? (
              <>
                <button type="button" className="btn btn--ghost" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={!canSubmit || submitting}>
                  {submitting ? "Abrindo chamados…" : `Abrir ${selected.size} chamado${selected.size === 1 ? "" : "s"}`}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--primary" onClick={onClose}>
                Fechar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
