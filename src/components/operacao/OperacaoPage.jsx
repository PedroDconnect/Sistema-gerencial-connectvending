import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { StatTile } from "../ativos/StatTile";
import { OperacaoFilters } from "./OperacaoFilters";
import { DailyTypeMetrics } from "./DailyTypeMetrics";
import { StatusBreakdown } from "./StatusBreakdown";
import { BreakdownTable } from "./BreakdownTable";
import { CustomerTypeTable } from "./CustomerTypeTable";
import { CustomerSlaTable } from "./CustomerSlaTable";
import { TasksAuditTable } from "./TasksAuditTable";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { useOperacaoSummary } from "../../hooks/useOperacaoSummary";
import { useOperacaoDetails } from "../../hooks/useOperacaoDetails";
import { useOperacaoTasks } from "../../hooks/useOperacaoTasks";
import { usePresentationMode } from "../../hooks/usePresentationMode";
import { formatPercent } from "../../services/operacaoService";

const EMPTY_FILTERS = {
  period: "today",
  dateFrom: "",
  dateTo: "",
  status: "",
  technician: "",
  customer: "",
  type: "",
  sla: "",
};

const SCOPE_META = {
  chamados: {
    title: "Operação · Chamados",
    subtitle: "Chamados técnicos, VmPay/UpPay, degustação e afins — sem abastecimento de rotina.",
  },
  rotina: {
    title: "Operação · Abastecimento Rotina",
    subtitle: "Só as visitas de reposição programada, separadas dos chamados pra carregar rápido.",
  },
};

function buildParams(filters, scope) {
  const params = {};
  if (scope) params.scope = scope;

  if (filters.period === "custom" && filters.dateFrom && filters.dateTo) {
    params.dateFrom = filters.dateFrom;
    params.dateTo = filters.dateTo;
  } else if (filters.period === "yesterday" || filters.period === "last7days") {
    params.period = filters.period;
  }

  if (filters.status) params.status = filters.status;
  if (filters.technician) params.technician = filters.technician;
  if (filters.customer) params.customer = filters.customer;
  if (filters.type) params.type = filters.type;
  if (filters.sla) params.sla = filters.sla;

  return params;
}

export function OperacaoPage({ scope }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(25);

  const meta = SCOPE_META[scope] ?? { title: "Operação", subtitle: "Visão consolidada da operação em tempo real." };
  const params = useMemo(() => buildParams(filters, scope), [filters, scope]);

  // Duas velocidades de propósito: /summary só conta o total (rápido, um
  // request leve) e pinta "Tarefas hoje" na hora. /details busca as
  // tarefas reais do período (única forma confiável de contar por status
  // na Auvo) e traz o resto — mais lento, então os outros KPIs e as
  // tabelas ficam em skeleton até chegar.
  const summary = useOperacaoSummary(params);
  const details = useOperacaoDetails(params);
  const tasks = useOperacaoTasks(useMemo(() => ({ ...params, page: auditPage, pageSize: auditPageSize }), [params, auditPage, auditPageSize]));

  const byType = details.data?.byType ?? [];
  const byTechnician = details.data?.byTechnician ?? [];
  const byCustomer = details.data?.byCustomer ?? [];
  const byCustomerType = details.data?.byCustomerType ?? [];
  const customerTypeCategories = details.data?.customerTypeCategories ?? [];
  const byCustomerSla = details.data?.byCustomerSla ?? [];
  const slaHours = details.data?.slaHours ?? 4;

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setAuditPage(1);
  }

  function handleClearFilters() {
    setFilters(EMPTY_FILTERS);
    setAuditPage(1);
  }

  function refreshAll() {
    summary.refetch();
    details.refetch();
    tasks.refetch();
  }

  const presentation = usePresentationMode(refreshAll);

  const anyError = details.error ?? summary.error;
  // /summary é um único request leve e confiável; /details busca as
  // tarefas de verdade e pode voltar incompleto num dia de Auvo instável
  // (dataIncomplete=true). Nesse caso, "Tarefas hoje" não pode trocar de
  // um número correto (summary) pra um bem menor e errado (details
  // parcial) só porque details chegou depois — só usa o total de details
  // quando ele realmente é completo.
  const totalToday =
    details.data && !details.data.dataIncomplete
      ? details.data.total
      : summary.data?.total ?? details.data?.total ?? 0;
  // Os 5 KPIs abaixo (Concluídas/Em andamento/.../Atenção) e a taxa de
  // conclusão só existem a partir das tarefas de verdade buscadas em
  // /details — quando isso vem incompleto (ex.: Auvo não respondeu pra
  // 95% das páginas), o número ainda é "real" tecnicamente, mas visto
  // isolado parece um dado errado/quebrado (ex.: "13 concluídas" quando
  // são ~1200 tarefas no dia). Melhor mostrar "—" do que uma contagem
  // minúscula que passa a impressão de erro.
  const isDetailsIncomplete = !anyError && Boolean(details.data?.dataIncomplete);

  return (
    <main className="main operacao-page">
      <header className="topbar">
        <div>
          <h1 className="topbar__title">{meta.title}</h1>
          <p className="topbar__subtitle">{meta.subtitle}</p>
        </div>
        {!presentation.active && (
          <div className="topbar__actions">
            {details.data && (
              <span className="ativos-page__sync">
                Última atualização: {new Date(details.data.generatedAt).toLocaleTimeString("pt-BR")}
              </span>
            )}
            <button type="button" className="btn btn--ghost" onClick={refreshAll}>
              <Icon name="refresh" size={16} />
              Atualizar dados
            </button>
            <button type="button" className="btn btn--ghost" onClick={presentation.enter}>
              <Icon name="expand" size={16} />
              Modo Apresentação
            </button>
          </div>
        )}
      </header>

      {presentation.active && (
        <div className="presentation-banner">
          <span className="presentation-banner__label">Modo Apresentação</span>
          <span className="presentation-banner__hint">
            Atualiza sozinho a cada 10 min
            {details.data && ` · Última atualização: ${new Date(details.data.generatedAt).toLocaleTimeString("pt-BR")}`}
          </span>
          <button type="button" className="btn btn--ghost" onClick={presentation.exit}>
            <Icon name="close" size={16} />
            Sair
          </button>
        </div>
      )}

      {anyError && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível atualizar os dados da operação.</strong>
            <p>{anyError.message}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={refreshAll}>
            Tentar novamente
          </button>
        </div>
      )}

      {isDetailsIncomplete && (
        <div className="state-warning-block">
          <strong>A Auvo não respondeu a tempo para a maior parte das tarefas do período.</strong>
          <p>
            "Tarefas hoje" continua correto (vem de uma consulta separada, mais leve). Os KPIs de status e os
            gráficos abaixo ficam ocultos em vez de mostrar uma contagem parcial que pareceria errada — as tabelas
            de tipo/técnico/cliente mostram o que foi possível buscar. Clique em "Atualizar dados" para tentar de
            novo.
          </p>
        </div>
      )}

      {!presentation.active && (
        <OperacaoFilters
          filters={filters}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
          technicianOptions={byTechnician}
          customerOptions={byCustomer}
          typeOptions={byType}
          scope={scope}
        />
      )}

      <section className="operacao-kpi-grid operacao-kpi-grid--compact">
        {summary.loading ? (
          <div className="stat-tile stat-tile--skeleton" />
        ) : (
          <StatTile label="Tarefas hoje" value={totalToday.toLocaleString("pt-BR")} />
        )}

        {details.loading
          ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="stat-tile stat-tile--skeleton" />)
          : [
              // Simplificado a pedido: só importa terminou ou não — os
              // status intermediários da Auvo (em deslocamento, em
              // atendimento, check-out, pausada) todos contam como "Em
              // aberto" aqui (mesmo princípio de StatusBreakdown).
              { label: "Finalizadas", value: details.data?.finished ?? 0, tone: "success" },
              {
                label: "Em aberto",
                value: Math.max((details.data?.total ?? 0) - (details.data?.finished ?? 0), 0),
                tone: "danger",
              },
            ].map((tile) => (
              <StatTile
                key={tile.label}
                label={tile.label}
                value={isDetailsIncomplete ? "—" : tile.value.toLocaleString("pt-BR")}
                tone={isDetailsIncomplete ? undefined : tile.tone}
                strong
              />
            ))}
      </section>

      {!details.loading && details.data && !isDetailsIncomplete && (
        <p className="operacao-completion-rate">
          Taxa de conclusão: <strong>{formatPercent(details.data.completionRate)}</strong>
        </p>
      )}

      <DailyTypeMetrics metrics={details.data?.dailyTypeMetrics ?? []} loading={details.loading} baseParams={params} />

      <StatusBreakdown summary={details.data} loading={details.loading || isDetailsIncomplete} />

      {scope !== "rotina" && (
        <>
          {/* Abastecimento de rotina nunca entra nessas duas: nenhuma das 3
              categorias nomeadas bate com "Abastecimento Rotina" (cairia tudo
              em "outros") e SLA não se aplica a ela (ver isSlaEligible no
              backend) — mostrar aqui na página dedicada de rotina só
              confundiria com tabelas sempre vazias/genéricas. */}
          <CustomerTypeTable rows={byCustomerType} categories={customerTypeCategories} loading={details.loading} />
          <CustomerSlaTable rows={byCustomerSla} slaHours={slaHours} loading={details.loading} />
        </>
      )}

      <section className="operacao-breakdowns-grid">
        <BreakdownTable title="Operação por Tipo" nameLabel="Tipo" rows={byType} loading={details.loading} />
        <BreakdownTable title="Desempenho por Técnico" nameLabel="Técnico" rows={byTechnician} loading={details.loading} />
        <BreakdownTable title="Operação por Cliente" nameLabel="Cliente" rows={byCustomer} loading={details.loading} />
      </section>

      <TasksAuditTable
        tasks={tasks}
        page={auditPage}
        pageSize={auditPageSize}
        onPageChange={setAuditPage}
        onPageSizeChange={(size) => {
          setAuditPageSize(size);
          setAuditPage(1);
        }}
        onSelect={(task) => setSelectedTaskId(task.id)}
      />

      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </main>
  );
}
