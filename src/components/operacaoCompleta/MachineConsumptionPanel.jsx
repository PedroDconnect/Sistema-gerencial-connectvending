import { useState } from "react";
import { useMachineConsumption } from "../../hooks/useMachineConsumption";
import { formatDayOnly, formatSyncTime, matchStatusMeta } from "../../services/operacaoCompletaService";

const PERIOD_PRESETS = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "custom", label: "Personalizado" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function MachineConsumptionPanel({ equipmentId }) {
  const [period, setPeriod] = useState("today");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());

  const params =
    period === "custom"
      ? { start_date: customFrom, end_date: customTo }
      : period === "today"
        ? {}
        : { period };

  const { loading, error, data } = useMachineConsumption(equipmentId, params);
  const meta = data ? matchStatusMeta(data.matchStatus) : null;
  const canShowConsumption = data && (data.matchStatus === "MATCH" || data.matchStatus === "MATCH_NORMALIZED");

  return (
    <section className="drawer-section">
      <span className="drawer-section__eyebrow">Consumo (VMpay)</span>

      <div className="segmented consumption-panel__periods">
        {PERIOD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`segmented__btn ${period === preset.id ? "is-active" : ""}`}
            onClick={() => setPeriod(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="operacao-filters__custom-dates consumption-panel__custom-dates">
          <label className="operacao-filters__field">
            <span>De</span>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </label>
          <label className="operacao-filters__field">
            <span>Até</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
        </div>
      )}

      {loading && <div className="stat-tile--skeleton" style={{ height: 90, borderRadius: 12, marginTop: 12 }} />}

      {error && (
        <div className="state-error-block" style={{ marginTop: 12 }}>
          <div>
            <strong>Não foi possível carregar o consumo.</strong>
            <p>{error.message}</p>
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {meta && data.matchStatus !== "MATCH" && (
            <div className={`state-warning-block consumption-panel__match-warning`} style={{ marginTop: 12 }}>
              <strong>
                <span className={`badge badge--${meta.variant}`}>{meta.label}</span>
              </strong>
              <p>
                {data.matchStatus === "MATCH_NORMALIZED" &&
                  "O patrimônio da Auvo bate com a VMpay só depois de normalizar (ex.: zeros à esquerda) — vale conferir se é o mesmo equipamento."}
                {data.matchStatus === "NOT_FOUND" &&
                  "Nenhuma máquina na VMpay tem esse patrimônio — sem cruzamento não é possível mostrar consumo real."}
                {data.matchStatus === "DUPLICATE" &&
                  `${data.candidateCount} máquinas na VMpay compartilham este patrimônio — ambíguo demais pra mostrar consumo com segurança.`}
                {data.matchStatus === "NOT_COMPUTED" && "Rode \"Atualizar dados\" para calcular o cruzamento desta máquina."}
              </p>
            </div>
          )}

          {canShowConsumption && (
            <>
              <div className="consumption-panel__totals">
                <div className="stat-tile">
                  <div className="stat-tile__label">Doses no período</div>
                  <div className="stat-tile__value num">{data.totalQuantity.toLocaleString("pt-BR")}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile__label">Vendas no período</div>
                  <div className="stat-tile__value num">{data.totalSales.toLocaleString("pt-BR")}</div>
                </div>
              </div>

              {data.byDay.length > 0 && (
                <div className="consumption-panel__by-day">
                  {data.byDay.map((d) => (
                    <div className="drawer-field" key={d.date}>
                      <span className="drawer-field__label">{formatDayOnly(d.date)}</span>
                      <span className="drawer-field__value">{d.quantity.toLocaleString("pt-BR")} doses</span>
                    </div>
                  ))}
                </div>
              )}

              {data.byProduct.length > 0 && (
                <div className="consumption-panel__by-product">
                  <span className="drawer-field__hint">Consumo por produto</span>
                  {data.byProduct.map((p) => (
                    <div className="drawer-field" key={p.productName}>
                      <span className="drawer-field__label">{p.productName}</span>
                      <span className="drawer-field__value">{p.quantity.toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              )}

              {data.totalSales === 0 && (
                <p className="drawer-field__hint">Nenhuma venda registrada neste período (máquina casada normalmente).</p>
              )}
            </>
          )}

          <p className="drawer-field__hint consumption-panel__sync-note">
            Vendas atualizadas em: {formatSyncTime(data.salesSyncedAt)}
            {data.salesSyncStatus === "error" && " — Atenção: última sincronização de vendas apresentou erro."}
            {data.salesSyncStatus === "partial" && " — sincronização de histórico ainda em andamento."}
          </p>
        </>
      )}
    </section>
  );
}
