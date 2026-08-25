import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { MachineStatusCards } from "./MachineStatusCards";
import { MachineMonitorTable } from "./MachineMonitorTable";
import { MachineDetailDrawer } from "./MachineDetailDrawer";
import { useVmpayMachineMonitor } from "../../hooks/useVmpayMachineMonitor";
import { formatDateTime, windowHours, filterMachines, machinesToCsv, downloadCsv } from "../../services/vmpayService";

export function TelemetriaPage() {
  const { loading, error, data, refetch } = useVmpayMachineMonitor();
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState([]);
  const hours = windowHours(data?.window);

  const filteredMachines = useMemo(
    () => filterMachines(data?.machines ?? [], { search, statusFilters }),
    [data, search, statusFilters]
  );

  function handleExport() {
    if (filteredMachines.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`telemetria-vmpay-${stamp}.csv`, machinesToCsv(filteredMachines));
  }

  return (
    <main className="main operacao-page">
      <header className="topbar">
        <div>
          <h1 className="topbar__title">Telemetria</h1>
          <p className="topbar__subtitle">
            Máquinas VMpay sem doses {hours ? `nas últimas ${hours} horas` : "no período monitorado"}.
          </p>
        </div>
        <div className="topbar__actions">
          {data?.generatedAt && (
            <span className="ativos-page__sync">Última atualização: {formatDateTime(data.generatedAt)}</span>
          )}
          <button type="button" className="btn btn--ghost" onClick={() => refetch(true)} disabled={loading}>
            <Icon name="refresh" size={16} />
            Atualizar agora
          </button>
          <button type="button" className="btn btn--ghost" onClick={handleExport} disabled={filteredMachines.length === 0}>
            <Icon name="download" size={16} />
            Exportar
          </button>
        </div>
      </header>

      {error && !data && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar os dados de telemetria.</strong>
            <p>{error.message}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => refetch(true)}>
            Tentar novamente
          </button>
        </div>
      )}

      {data?.vendsUnavailable && (
        <div className="state-warning-block">
          <strong>⚠️ Não foi possível atualizar os dados de vendas.</strong>
          <p>Os status abaixo podem não refletir as doses mais recentes — os demais dados (comunicação) seguem válidos.</p>
        </div>
      )}

      {!data?.vendsUnavailable && data?.installationsUnavailable && (
        <div className="state-warning-block">
          <strong>⚠️ Não foi possível atualizar os dados de instalação/comunicação.</strong>
          <p>Parte das máquinas está classificada como "Dados indisponíveis" até a próxima atualização.</p>
        </div>
      )}

      <MachineStatusCards summary={data?.summary} loading={loading && !data} />

      <MachineMonitorTable
        machines={filteredMachines}
        loading={loading && !data}
        search={search}
        onSearchChange={setSearch}
        statusFilters={statusFilters}
        onStatusFiltersChange={setStatusFilters}
        onSelect={setSelectedMachine}
      />

      <MachineDetailDrawer machine={selectedMachine} windowHours={hours} onClose={() => setSelectedMachine(null)} />
    </main>
  );
}
