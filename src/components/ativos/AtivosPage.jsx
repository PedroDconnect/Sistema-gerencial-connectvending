import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { StatTile } from "./StatTile";
import { AtivosFilters } from "./AtivosFilters";
import { AtivosTable } from "./AtivosTable";
import { GroupDistribution } from "./GroupDistribution";
import { AtivoDetailDrawer } from "./AtivoDetailDrawer";
import { useAtivos } from "../../hooks/useAtivos";
import {
  computeAtivosStats,
  distinctSorted,
  filterAtivos,
  formatSyncTime,
  ativosToCsv,
  downloadCsv,
} from "../../services/ativosService";

const EMPTY_FILTERS = { modelo: [], clienteNome: [], filial: [], pontoVenda: [], clienteLoja: [] };

export function AtivosPage() {
  const { loading, refreshing, error, data, fetchedAt, refetch } = useAtivos();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedAtivo, setSelectedAtivo] = useState(null);

  const stats = useMemo(() => computeAtivosStats(data), [data]);

  const filterOptions = useMemo(
    () => ({
      modelos: distinctSorted(data, "modelo"),
      clientes: distinctSorted(data, "clienteNome"),
      filiais: distinctSorted(data, "filial"),
      pontosVenda: distinctSorted(data, "pontoVenda"),
      lojas: distinctSorted(data, "clienteLoja"),
    }),
    [data]
  );

  const filteredList = useMemo(() => filterAtivos(data, { search, ...filters }), [data, search, filters]);

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleClearFilters() {
    setSearch("");
    setFilters(EMPTY_FILTERS);
  }

  function handleExport() {
    if (filteredList.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`ativos-${stamp}.csv`, ativosToCsv(filteredList));
  }

  const syncLabel = formatSyncTime(fetchedAt);
  const isInitialLoading = loading && data.length === 0;

  return (
    <main className="main ativos-page">
      <header className="topbar ativos-page__header">
        <div>
          <h1 className="topbar__title">Controle de Ativos</h1>
          <p className="topbar__subtitle">Visão consolidada das máquinas por modelo, cliente e localização.</p>
        </div>
        <div className="topbar__actions">
          {syncLabel && !isInitialLoading && (
            <span className="ativos-page__sync">
              {refreshing ? "Atualizando dados..." : `Última sincronização: ${syncLabel}`}
            </span>
          )}
          <button type="button" className="btn btn--ghost" onClick={refetch} disabled={refreshing || isInitialLoading}>
            <Icon name="refresh" size={16} />
            Atualizar dados
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleExport}
            disabled={filteredList.length === 0}
          >
            <Icon name="download" size={16} />
            Exportar
          </button>
        </div>
      </header>

      {error && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar os ativos.</strong>
            <p>{error.message || "Verifique a conexão com a API do Protheus e tente novamente."}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={refetch}>
            Tentar novamente
          </button>
        </div>
      )}

      {!error && isInitialLoading && (
        <section className="ativos-kpi-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="stat-tile stat-tile--skeleton" />
          ))}
        </section>
      )}

      {!error && !isInitialLoading && (
        <>
          <section className="ativos-kpi-grid">
            <StatTile label="Total de Ativos" value={stats.total.toLocaleString("pt-BR")} />
            <StatTile label="Modelos" value={stats.modelos.toLocaleString("pt-BR")} />
            <StatTile label="Clientes" value={stats.clientes.toLocaleString("pt-BR")} />
            <StatTile label="Pontos de Venda" value={stats.pontosVenda.toLocaleString("pt-BR")} />
            <StatTile label="Filiais" value={stats.filiais.toLocaleString("pt-BR")} />
          </section>

          <AtivosFilters
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            onFilterChange={handleFilterChange}
            onClear={handleClearFilters}
            options={filterOptions}
          />

          <AtivosTable data={filteredList} onSelect={setSelectedAtivo} />

          <GroupDistribution
            title="Distribuição por Modelo"
            hint="Clique em um modelo para ver quantas máquinas cada cliente tem desse modelo."
            data={filteredList}
            field="modelo"
            emptyLabel="Sem modelo informado"
            secondaryField="clienteNome"
            secondaryEmptyLabel="Sem cliente atribuído"
            secondaryLabel="Clientes"
            onSelect={setSelectedAtivo}
            columns={[
              { key: "codigo", label: "Código", numeric: true },
              { key: "numeroSerie", label: "Nº de Série", numeric: true },
              { key: "pontoVenda", label: "Ponto de Venda", numeric: true },
              { key: "clienteLoja", label: "Loja", numeric: true },
            ]}
          />

          <GroupDistribution
            title="Distribuição por Cliente"
            hint="Clique em um cliente para ver quantas máquinas de cada modelo ele tem."
            data={filteredList}
            field="clienteNome"
            emptyLabel="Sem cliente atribuído"
            secondaryField="modelo"
            secondaryEmptyLabel="Sem modelo informado"
            secondaryLabel="Modelos"
            onSelect={setSelectedAtivo}
            columns={[
              { key: "codigo", label: "Código", numeric: true },
              { key: "numeroSerie", label: "Nº de Série", numeric: true },
              { key: "pontoVenda", label: "Ponto de Venda", numeric: true },
              { key: "clienteLoja", label: "Loja", numeric: true },
            ]}
          />
        </>
      )}

      <AtivoDetailDrawer ativo={selectedAtivo} onClose={() => setSelectedAtivo(null)} />
    </main>
  );
}
