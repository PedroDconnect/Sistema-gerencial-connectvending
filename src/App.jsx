import { useMemo, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { KpiCard } from "./components/KpiCard";
import { RevenueChart } from "./components/RevenueChart";
import { ChannelDonut } from "./components/ChannelDonut";
import { Login } from "./components/Login";
import { SetupNeeded } from "./components/SetupNeeded";
import { AtivosPage } from "./components/ativos/AtivosPage";
import { OperacaoPage } from "./components/operacao/OperacaoPage";
import { TelemetriaPage } from "./components/telemetria/TelemetriaPage";
import { OperacaoCompletaPage } from "./components/operacaoCompleta/OperacaoCompletaPage";
import { AdminUsersPage } from "./components/admin/AdminUsersPage";
import { PreparationTemplateSettingsPage } from "./components/admin/PreparationTemplateSettingsPage";
import { PreparationOrdersPage } from "./components/preparations/PreparationOrdersPage";
import { navItems } from "./data/mockData";
import { formatCompactCurrency, formatDeltaPct } from "./lib/format";
import { useAuth } from "./context/AuthContext";
import { useSalesOverview } from "./hooks/useSalesOverview";
import { useSidebarCollapsed } from "./hooks/useSidebarCollapsed";
import "./App.css";

function Dashboard() {
  const { loading, error, data, refetch } = useSalesOverview();

  // Só os dois KPIs com fonte de dados real (Supabase, useSalesOverview) —
  // Lucro Operacional/Margem Operacional/Fluxo de Caixa eram fictícios
  // (sem tabela de custos/caixa real por trás) e foram removidos.
  const kpiCards = useMemo(() => {
    if (!data) return [];

    const revenueCard = {
      id: "revenue",
      label: "Receita Total",
      value: formatCompactCurrency(data.revenueMtd),
      delta: formatDeltaPct(data.revenueDeltaPct),
      direction: data.revenueDeltaPct >= 0 ? "up" : "down",
      icon: "dollar",
      accent: "blue",
      sparkline: data.revenueDaily.length > 1 ? data.revenueDaily.map((p) => p.value) : [1, 1],
    };

    const customersCard = {
      id: "customers",
      label: "Novos Clientes",
      value: data.newCustomersMtd.toLocaleString("pt-BR"),
      delta: formatDeltaPct(data.newCustomersDeltaPct),
      direction: data.newCustomersDeltaPct >= 0 ? "up" : "down",
      icon: "users",
      accent: "yellow",
      sparkline: [1, 1], // no daily customers series yet
    };

    return [revenueCard, customersCard];
  }, [data]);

  return (
    <main className="main">
      <Header />

      {error && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar os dados do Supabase.</strong>
            <p>{error.message}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={refetch}>
            Tentar novamente
          </button>
        </div>
      )}

      <section className="kpi-grid">
        {loading
          ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="kpi-card kpi-card--skeleton" />)
          : kpiCards.map((kpi) => <KpiCard key={kpi.id} {...kpi} />)}
      </section>

      <section className="mid-grid">
        <RevenueChart
          daily={data?.revenueDaily ?? []}
          weekly={data?.revenueWeekly ?? []}
          monthly={data?.revenueMonthly ?? []}
          total={data?.revenueMtd ?? 0}
          deltaPct={data?.revenueDeltaPct ?? 0}
        />
        <ChannelDonut channels={data?.channelBreakdown ?? []} total={data?.revenueMtd ?? 0} />
      </section>
    </main>
  );
}

// Procura tanto no nível raiz quanto dentro de grupos (ex.:
// "operacao-chamados" mora dentro do grupo "Operação") — o find() plano
// antigo só olhava o raiz.
function findNavItem(id) {
  for (const item of navItems) {
    if (item.id === id) return item;
    const child = item.children?.find((c) => c.id === id);
    if (child) return child;
  }
  return null;
}

function AccessDenied({ label }) {
  return (
    <main className="main">
      <div className="state-warning-block">
        <strong>Sem acesso a {label}.</strong>
        <p>Fale com um administrador se precisar dessa liberação.</p>
      </div>
    </main>
  );
}

function App() {
  const { session, loading, configured, isAdmin, hasModuleAccess } = useAuth();
  const [active, setActive] = useState("overview");
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed();

  if (!configured) {
    return <SetupNeeded />;
  }

  if (loading) {
    return <div className="login-screen">Carregando…</div>;
  }

  if (!session) {
    return <Login />;
  }

  const activeNavItem = findNavItem(active);

  function renderContent() {
    // "administracao" virou grupo (Usuários / Ficha de Preparação) — os
    // dois filhos são gated só por isAdmin, nunca por hasModuleAccess,
    // mesma regra que "administracao" sozinho já seguia antes.
    if (active === "administracao-usuarios") {
      return isAdmin ? <AdminUsersPage /> : <AccessDenied label="Administração" />;
    }
    if (active === "administracao-ficha-preparacao") {
      return isAdmin ? <PreparationTemplateSettingsPage /> : <AccessDenied label="Administração" />;
    }
    if (!hasModuleAccess(active)) {
      return <AccessDenied label={activeNavItem?.label ?? "este módulo"} />;
    }
    if (active === "overview") return <Dashboard />;
    if (active === "ativos") return <AtivosPage />;
    if (active === "preparacoes") return <PreparationOrdersPage />;
    if (active === "operacao-chamados") return <OperacaoPage scope="chamados" />;
    if (active === "operacao-rotina") return <OperacaoPage scope="rotina" />;
    if (active === "telemetria") return <TelemetriaPage />;
    if (active === "operacao-completa") return <OperacaoCompletaPage />;
    // Todo id em navItems cai em um dos ramos acima ou em "administracao" —
    // nunca deveria chegar aqui na prática (não existe mais módulo
    // "em breve" sem fonte de dados real); mantido só como rede de
    // segurança caso o estado "active" fique com um id inesperado.
    return <AccessDenied label={activeNavItem?.label ?? "este módulo"} />;
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
      <Sidebar
        active={active}
        onNavigate={setActive}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />
      {renderContent()}
    </div>
  );
}

export default App;
