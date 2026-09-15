# Painel ConnectFash — especificação (registrado em 14/09/2026)

**Status (14/09/2026): Etapa 2 (Painel Gerencial, dado real) implementada.**
Ver `src/components/connectfash/` (`ConnectFashPage.jsx`, `EntityDrawer.jsx`,
`ClientesComMaquinas.jsx`), nav item `connectfash` em `mockData.js`/`App.jsx`/
`supabase/functions/admin/shared/auth.ts`. "Vincular chamado" ficou mais
simples do que o §1 descrevia: só pré-preenche o texto da descrição com a
referência da OS de origem — não pré-seleciona o cliente, porque o id de
cliente usado por `TechnicalVisitModal` (`auvo_customers.id`, PK interna) é
diferente do `customerId` (id da Auvo) usado nas agregações de tarefa, e não
existe hoje uma tradução confiável entre os dois sem mais uma consulta.
Painel Supervisor, categoria "Preventivo" e o data lake no Backblaze
continuam pendentes (ver §5/§6, nada mudou aí).

Origem: transcrição de voz do Pedro descrevendo o painel gerencial e o painel
do supervisor. Este documento organiza o pedido e o confronta com o estado
real do código (auditoria feita antes do protótipo visual).

Protótipo visual (Etapa 1, feito): mockup navegável com dados fictícios,
publicado como Artifact — ver link enviado na conversa. Reproduz o design
system real do app (`src/theme.css`, `docs/design-system.md`).

---

## 1. Painel Gerencial

**Cabeçalho**: filtro de período (Hoje / 7 dias / 30 dias / custom).

**Números macro do período**:
- Atividades registradas
- Técnicos ativos
- Agendas de abastecimento
- Chamados corretivos abertos
- Chamados preventivos

**Indicadores**:
- Chamados realizados
- Chamados ainda em aberto
- Chamados atrasados (conforme SLA)

**Detalhamento**:
- Top Cliente / Top Técnico / Top Supervisor — qtd. de atividades feitas e
  ainda abertas
- Lista de todos os técnicos cadastrados — abertas, fechadas, acumulado, e
  score de desempenho em % (fechadas / acumulado)
- Painel de Clientes com Máquinas — quais clientes têm mais máquinas
  instaladas e quantos chamados técnicos vs. operacionais/abastecimento
  estão abertos neles

**Drill-down**: clicar em técnico, cliente ou qualquer indicador abre o
detalhamento até a OS individual → ver a atividade executada e o link/anexo
da execução.

**Ação sobre um chamado já executado**: opção de abrir um novo chamado
vinculado/reatribuído àquele OS (não é editar o chamado original, é criar um
vínculo/novo chamado referenciando o mesmo caso).

## 2. Painel Supervisor

- Visão da carteira do supervisor: clientes, indicadores de chamados, e sua
  equipe (técnicos/abastecedores).
- Pode abrir chamado ou redirecionar chamado para outro técnico da equipe.
- Abertura inicial sempre com referência comparativa em %: hoje vs. semana
  passada vs. mesmo período em 30 dias.
- **Regra de cor (importante, não é "queda = verde" universal)**: a cor da
  seta depende da polaridade do indicador, não da direção bruta:
  - Corretivo, atrasado (SLA) → **menos é bom** → queda aparece em **verde**.
  - Preventivo, retorno/reincidência, concluídos → **menos é ruim** → queda
    aparece em **vermelho** (ponto de atenção).
  - Isso é o oposto do padrão atual do `KpiCard` (`kpi-card__delta--up` /
    `--down` fixos em `App.css:614-619`, que colorem por direção, não por
    polaridade) — vai precisar de uma variante nova do componente com um
    parâmetro tipo `goodDirection: "up" | "down"` por KPI.

## 3. Fase 2 (mencionada, não detalhada ainda): Data Lake no Backblaze

Guardar todo o histórico de chamados desde janeiro/2026 em um data lake no
Backblaze B2. Ver §5 (gaps) — isso é pré-requisito técnico do próprio Painel
Gerencial, não só um "próximo passo" independente, porque hoje não existe
histórico de chamados armazenado localmente (ver abaixo).

---

## 4. O que já existe no código e pode ser reaproveitado

- `src/components/operacao/OperacaoPage.jsx` e vizinhos (`StatTile`,
  `DailyTypeMetrics`, `StatusBreakdown`, `BreakdownTable`, `CustomerTypeTable`,
  `CustomerSlaTable`, `TasksAuditTable`, `TaskDetailDrawer`,
  `OperacaoFilters`) — é o analógico mais próximo de um dashboard de
  chamados que já existe, com "Modo Apresentação" (`usePresentationMode.js`).
- `OpenTicketChooser.jsx` → `TechnicalVisitModal.jsx` / `NewOrderWizard.jsx`
  — fluxo de abertura de chamado já existente, para reaproveitar no "Abrir
  chamado" do painel novo.
- Integração Auvo já existe nas Edge Functions `operation` e `preparations`
  (`supabase/functions/operation/integrations/auvo/*`).
- Classificação de categoria (corretivo, abastecimento, logística, VmPay,
  degustação, finalização) já existe em
  `supabase/functions/operation/service/taskTypeCategories.ts`.
- SLA já existe como filtro booleano (dentro/fora), `slaHours` configurável,
  padrão 4h (`service/filters.ts`).
- Padrão de UI para "métrica ainda sem dado real": `KpiCard` já tem uma
  prop `mock` que renderiza uma etiqueta "simulado" — reaproveitado no
  protótipo visual para: categoria Preventivo, papel de Supervisor e Score
  de técnico.

## 5. Gaps reais entre o pedido e o sistema hoje (decisões necessárias antes da Etapa 2 — sistema de verdade)

1. **Não existe categoria "Preventivo"** na classificação de tipos de tarefa
   do Auvo (`taskTypeCategories.ts`) — só corretivo, abastecimento (chamado e
   rotina), logística, VmPay/UpPay, degustação, finalização de máquina.
   → Precisa definir com Auvo/operação qual `taskTypeId`/nome vira
   "preventivo", ou se isso é um chamado corretivo com sub-motivo.
2. **Não existe o conceito de "supervisor" em lugar nenhum** — nem tabela,
   nem role de auth. Auth hoje é binário (`app_metadata.role` = `admin` ou
   `user`) + allowlist de módulos por usuário (`AuthContext.jsx`,
   `mockData.js`). → Precisa decidir o modelo: novo role
   `supervisor_tecnico`/`supervisor_operacional`? Uma tabela de carteira
   (supervisor → lista de clientes/técnicos)? Quem cadastra isso?
3. **Não existe "técnico" como entidade cadastrada** — hoje é só um par
   id/nome que vem solto no payload de tarefa do Auvo. Um score/pontuação
   por técnico junto de "ativos" precisa de uma fonte de verdade (cadastro
   de técnicos, ou inferir "ativo" por ter tarefa nos últimos N dias).
4. **Chamados não são armazenados localmente.** `OperacaoPage` consulta a
   API do Auvo **ao vivo** a cada request (cache de 15s em memória,
   `MAX_DATE_RANGE_DAYS = 31` por chamada). Um painel gerencial com
   comparativo "hoje vs. semana passada vs. 30 dias" e histórico desde
   janeiro **não é viável só com chamadas ao vivo** — precisa de uma tabela
   de histórico/agregação (mesmo padrão já usado em
   `machine_consumption_daily`/`auvo_tasks_cache`), alimentada por um job
   periódico. Isso conecta diretamente com a Fase 2 (data lake): faz sentido
   resolver as duas juntas, não como fases isoladas.
5. Não existe hoje um fluxo de **"vincular chamado a um chamado existente"**
   — só abrir chamado novo do zero (`OpenTicketChooser`). Precisa confirmar
   com a Auvo se a API deles suporta vínculo/reatribuição nativa de tarefa,
   ou se isso vira um campo customizado nosso (ex.: `chamado_origem_id`)
   guardado só do nosso lado.

## 6. Fase 2 — Data lake de chamados no Backblaze (esboço, aguardando decisão)

Pedido do Pedro: guardar todo o histórico de chamados desde janeiro num data
lake no Backblaze. Pontos em aberto antes de implementar:

- Backblaze B2 é armazenamento frio/S3-compatível — bom para o **arquivo
  histórico bruto** (ex.: NDJSON/Parquet particionado por mês), mas não é
  banco de consulta rápida para o dashboard. Proposta: ETL noturno (Edge
  Function agendada) que pagina a API do Auvo (respeitando o limite de 31
  dias por chamada, com backfill mês a mês desde janeiro) e grava:
  (a) o payload bruto no B2 (data lake / auditoria), e
  (b) uma tabela agregada no Supabase (mesmo padrão de
  `machine_consumption_daily`) para o dashboard consultar rápido.
- Falta: credenciais do Backblaze (application key ID/secret, nome do
  bucket), confirmação se a Auvo permite paginar histórico desde janeiro sem
  limite de retenção do lado deles, e a granularidade desejada do arquivo
  (por chamado bruto? já normalizado?).

---

## Próximos passos

1. Pedro revisa o protótipo visual (Artifact) e confirma/ajusta o que está
   errado ou faltando.
2. Decidir os gaps do §5 (categoria preventivo, modelo de supervisor,
   cadastro de técnico, e principalmente a estratégia de histórico —
   já pensando junto com o data lake do §6, não separado).
3. Construir o sistema de verdade: novos componentes em
   `src/components/connectFash/`, reaproveitando `OperacaoPage` e o fluxo de
   abertura de chamado já existentes.
4. Job de ETL + Backblaze (§6), rodando em paralelo/depois, alimentando o
   painel com histórico real desde janeiro.
