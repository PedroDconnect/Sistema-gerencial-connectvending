import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { StatTile } from "../ativos/StatTile";
import { AssetsFilters } from "./AssetsFilters";
import { ActiveFiltersBar } from "./ActiveFiltersBar";
import { AssetsTable } from "./AssetsTable";
import { CustomersFilters } from "./CustomersFilters";
import { CustomersTable } from "./CustomersTable";
import { AssetsMap } from "./AssetsMap";
import { AssetDetailDrawer } from "./AssetDetailDrawer";
import { CustomerDetailDrawer } from "./CustomerDetailDrawer";
import { InconsistenciesTable } from "./InconsistenciesTable";
import { useOperacaoCompletaOverview } from "../../hooks/useOperacaoCompletaOverview";
import { useOperacaoCompletaAssets } from "../../hooks/useOperacaoCompletaAssets";
import { useOperacaoCompletaCustomers } from "../../hooks/useOperacaoCompletaCustomers";
import { useOperacaoCompletaMap } from "../../hooks/useOperacaoCompletaMap";
import { useOperacaoCompletaFilterOptions } from "../../hooks/useOperacaoCompletaFilterOptions";
import { useOperacaoCompletaInconsistencies } from "../../hooks/useOperacaoCompletaInconsistencies";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { postOperation } from "../../lib/operationApi";
import { postVmpay } from "../../lib/vmpayApi";
import { formatSyncTime } from "../../services/operacaoCompletaService";

const PAGE_SIZE = 50;
const EMPTY_ASSET_FILTERS = { status: "", linkStatus: "", models: [], customers: [], states: [] };
const EMPTY_CUSTOMER_FILTERS = { status: "", equipmentStatus: "" };

export function OperacaoCompletaPage() {
  const [tab, setTab] = useState("assets");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const [assetSearch, setAssetSearch] = useState("");
  const [assetFilters, setAssetFilters] = useState(EMPTY_ASSET_FILTERS);
  const [assetsPage, setAssetsPage] = useState(1);
  const debouncedAssetSearch = useDebouncedValue(assetSearch);

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilters, setCustomerFilters] = useState(EMPTY_CUSTOMER_FILTERS);
  const [customersPage, setCustomersPage] = useState(1);
  const debouncedCustomerSearch = useDebouncedValue(customerSearch);

  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [inconsistenciesPage, setInconsistenciesPage] = useState(1);

  const overview = useOperacaoCompletaOverview();
  const filterOptions = useOperacaoCompletaFilterOptions();

  const assetsParams = useMemo(
    () => ({
      page: assetsPage,
      pageSize: PAGE_SIZE,
      search: debouncedAssetSearch,
      status: assetFilters.status,
      linkStatus: assetFilters.linkStatus,
      models: assetFilters.models,
      customers: assetFilters.customers,
      states: assetFilters.states,
    }),
    [assetsPage, debouncedAssetSearch, assetFilters]
  );
  const assets = useOperacaoCompletaAssets(assetsParams);

  const customersParams = useMemo(
    () => ({
      page: customersPage,
      pageSize: PAGE_SIZE,
      search: debouncedCustomerSearch,
      status: customerFilters.status,
      equipmentStatus: customerFilters.equipmentStatus,
    }),
    [customersPage, debouncedCustomerSearch, customerFilters]
  );
  const customers = useOperacaoCompletaCustomers(customersParams);

  // Mapa segue os mesmos filtros da tabela de máquinas (seção 26 do
  // pedido) — busca sempre e sem paginação, o volume total (~1.500 pontos)
  // cabe numa resposta só.
  const mapParams = useMemo(
    () => ({
      status: assetFilters.status,
      models: assetFilters.models,
      customers: assetFilters.customers,
      states: assetFilters.states,
    }),
    [assetFilters]
  );
  const map = useOperacaoCompletaMap(mapParams);

  const inconsistenciesParams = useMemo(() => ({ page: inconsistenciesPage, pageSize: PAGE_SIZE }), [inconsistenciesPage]);
  const inconsistencies = useOperacaoCompletaInconsistencies(inconsistenciesParams);

  function handleAssetFilterChange(key, value) {
    setAssetFilters((prev) => ({ ...prev, [key]: value }));
    setAssetsPage(1);
  }

  // Remove um único valor de um filtro de múltipla seleção (usado pelo "x"
  // de cada chip na ActiveFiltersBar) — sem precisar limpar o filtro inteiro.
  function handleRemoveFilterValue(key, value) {
    setAssetFilters((prev) => ({ ...prev, [key]: prev[key].filter((v) => v !== value) }));
    setAssetsPage(1);
  }

  function handleCustomerFilterChange(key, value) {
    setCustomerFilters((prev) => ({ ...prev, [key]: value }));
    setCustomersPage(1);
  }

  function refreshAll() {
    overview.refetch();
    assets.refetch();
    customers.refetch();
    map.refetch();
    inconsistencies.refetch();
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      // As quatro sincronizações são independentes (Auvo, cruzamento por
      // patrimônio, vendas VMpay, chamados Auvo) — disparadas juntas pra
      // um só clique atualizar tudo que a Operação Completa mostra.
      // allSettled: uma falhar (ex.: sales-sync/tasks-sync demora mais e
      // dá timeout) não deve esconder o que as outras conseguiram atualizar.
      const results = await Promise.allSettled([
        postOperation("/assets-sync"),
        postVmpay("/registry-sync"),
        postVmpay("/sales-sync"),
        postOperation("/tasks-sync"),
      ]);
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        setSyncError(new Error(failed.map((r) => r.reason?.message ?? "Falha desconhecida.").join(" ")));
      }
      refreshAll();
    } catch (error) {
      setSyncError(error);
    } finally {
      setSyncing(false);
    }
  }

  const anyError = overview.error;

  return (
    <main className="main operacao-page">
      <header className="topbar">
        <div>
          <h1 className="topbar__title">Operação Completa</h1>
          <p className="topbar__subtitle">Visão consolidada de clientes, máquinas e ativos da operação.</p>
        </div>
        <div className="topbar__actions">
          <span className="ativos-page__sync">
            {overview.data?.syncStatus === "error" ? (
              <>Última sincronização: {formatSyncTime(overview.data?.lastSyncedAt)} — Atenção: última atualização apresentou erro.</>
            ) : (
              <>Última sincronização: {formatSyncTime(overview.data?.lastSyncedAt)}</>
            )}
          </span>
          <button type="button" className="btn btn--ghost" onClick={handleSync} disabled={syncing}>
            <Icon name="refresh" size={16} />
            {syncing ? "Sincronizando..." : "Atualizar dados"}
          </button>
        </div>
      </header>

      {anyError && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar a visão geral.</strong>
            <p>{anyError.message}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={refreshAll}>
            Tentar novamente
          </button>
        </div>
      )}

      {syncError && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível sincronizar com a Auvo agora.</strong>
            <p>{syncError.message} Os dados exibidos continuam sendo os da última sincronização válida.</p>
          </div>
        </div>
      )}

      <section className="operacao-kpi-grid">
        {overview.loading
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="stat-tile stat-tile--skeleton" />)
          : [
              { label: "Clientes", value: overview.data?.customers.total ?? 0 },
              { label: "Clientes ativos", value: overview.data?.customers.active ?? 0 },
              { label: "Máquinas", value: overview.data?.equipment.total ?? 0 },
              { label: "Máquinas ativas", value: overview.data?.equipment.active ?? 0 },
              { label: "Máquinas sem cliente", value: overview.data?.equipment.withoutCustomer ?? 0, tone: "danger" },
              { label: "Clientes sem máquinas", value: overview.data?.customers.withoutEquipment ?? 0 },
            ].map((tile) => (
              <StatTile key={tile.label} label={tile.label} value={tile.value.toLocaleString("pt-BR")} tone={tile.tone} />
            ))}
      </section>

      <ActiveFiltersBar
        search={debouncedAssetSearch}
        filters={assetFilters}
        onRemoveSearch={() => setAssetSearch("")}
        onRemoveValue={handleRemoveFilterValue}
        onClearStatus={() => handleAssetFilterChange("status", "")}
        onClearLinkStatus={() => handleAssetFilterChange("linkStatus", "")}
        onClearAll={() => {
          setAssetSearch("");
          setAssetFilters(EMPTY_ASSET_FILTERS);
          setAssetsPage(1);
        }}
      />

      <AssetsMap
        points={map.items}
        loading={map.loading}
        withoutLocation={map.withoutLocation}
        totalMatching={assets.total}
        onSelect={setSelectedAssetId}
      />

      <div className="segmented operacao-completa-tabs">
        <button type="button" className={`segmented__btn ${tab === "assets" ? "is-active" : ""}`} onClick={() => setTab("assets")}>
          Máquinas
        </button>
        <button type="button" className={`segmented__btn ${tab === "customers" ? "is-active" : ""}`} onClick={() => setTab("customers")}>
          Clientes
        </button>
        <button
          type="button"
          className={`segmented__btn ${tab === "inconsistencies" ? "is-active" : ""}`}
          onClick={() => setTab("inconsistencies")}
        >
          Inconsistências
        </button>
      </div>

      {tab === "assets" && (
        <>
          <AssetsFilters
            search={assetSearch}
            onSearchChange={setAssetSearch}
            filters={assetFilters}
            onFilterChange={handleAssetFilterChange}
            options={filterOptions}
            onClear={() => {
              setAssetSearch("");
              setAssetFilters(EMPTY_ASSET_FILTERS);
              setAssetsPage(1);
            }}
          />
          <AssetsTable
            assets={assets}
            page={assetsPage}
            pageSize={PAGE_SIZE}
            onPageChange={setAssetsPage}
            onSelect={(asset) => setSelectedAssetId(asset.equipmentId)}
          />
        </>
      )}

      {tab === "customers" && (
        <>
          <CustomersFilters
            search={customerSearch}
            onSearchChange={setCustomerSearch}
            filters={customerFilters}
            onFilterChange={handleCustomerFilterChange}
            onClear={() => {
              setCustomerSearch("");
              setCustomerFilters(EMPTY_CUSTOMER_FILTERS);
              setCustomersPage(1);
            }}
          />
          <CustomersTable
            customers={customers}
            page={customersPage}
            pageSize={PAGE_SIZE}
            onPageChange={setCustomersPage}
            onSelect={(customer) => setSelectedCustomerId(customer.customerId)}
          />
        </>
      )}

      {tab === "inconsistencies" && (
        <InconsistenciesTable
          inconsistencies={inconsistencies}
          page={inconsistenciesPage}
          pageSize={PAGE_SIZE}
          onPageChange={setInconsistenciesPage}
          onSelect={(row) => setSelectedAssetId(row.auvoEquipmentId)}
        />
      )}

      <AssetDetailDrawer equipmentId={selectedAssetId} onClose={() => setSelectedAssetId(null)} />
      <CustomerDetailDrawer customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(null)} />
    </main>
  );
}
