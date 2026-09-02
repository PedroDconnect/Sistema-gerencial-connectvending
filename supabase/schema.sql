-- Painel Gerencial — Visão Geral schema
-- Run this in the Supabase SQL Editor (or via `psql`) on a fresh project.

create extension if not exists "pgcrypto";

-- ---------- Tables ----------

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  industry text,
  company_size text,
  created_at timestamptz not null default now()
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  title text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  status text not null check (status in ('open', 'closed', 'lost')),
  channel text not null check (channel in ('direct', 'ecommerce', 'marketplaces', 'partners')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists sales_created_at_idx on sales (created_at desc);
create index if not exists sales_status_idx on sales (status);
create index if not exists sales_channel_idx on sales (channel);
create index if not exists customers_created_at_idx on customers (created_at desc);

-- ---------- Row Level Security ----------
-- Read access is restricted to logged-in (Supabase Auth) users. There is no
-- anon policy on purpose — the anon key alone must not be able to read
-- revenue/customer data.

alter table customers enable row level security;
alter table sales enable row level security;

drop policy if exists "authenticated_read_customers" on customers;
create policy "authenticated_read_customers"
  on customers for select
  to authenticated
  using (true);

drop policy if exists "authenticated_read_sales" on sales;
create policy "authenticated_read_sales"
  on sales for select
  to authenticated
  using (true);

-- ---------- KPI views ----------
-- security_invoker makes each view run with the *caller's* privileges, so
-- the RLS policies above still apply to anyone querying these views —
-- the views themselves don't need their own policies.

create or replace view kpi_overview
  with (security_invoker = true) as
select
  coalesce(sum(amount) filter (
    where status = 'closed' and created_at >= date_trunc('month', now())
  ), 0) as revenue_mtd,
  coalesce(sum(amount) filter (
    where status = 'closed'
      and created_at >= date_trunc('month', now() - interval '1 month')
      and created_at < date_trunc('month', now())
  ), 0) as revenue_prev_month,
  count(*) filter (where status = 'open') as deals_open,
  count(*) filter (
    where status = 'closed' and created_at >= date_trunc('month', now())
  ) as deals_closed_mtd,
  coalesce(avg(amount) filter (where status != 'lost'), 0) as avg_deal
from sales;

create or replace view kpi_customers
  with (security_invoker = true) as
select
  count(*) filter (where created_at >= date_trunc('month', now())) as new_customers_mtd,
  count(*) filter (
    where created_at >= date_trunc('month', now() - interval '1 month')
      and created_at < date_trunc('month', now())
  ) as new_customers_prev_month
from customers;

create or replace view kpi_channel_breakdown
  with (security_invoker = true) as
with totals as (
  select channel, sum(amount) as total
  from sales
  where status = 'closed' and created_at >= date_trunc('month', now())
  group by channel
)
select
  channel,
  total,
  round(100.0 * total / greatest(sum(total) over (), 1), 1) as pct
from totals
order by total desc;

create or replace view kpi_revenue_daily
  with (security_invoker = true) as
select
  d::date as day,
  coalesce(sum(s.amount) filter (where s.status = 'closed'), 0) as day_total
from generate_series(
  date_trunc('month', now()),
  (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date,
  interval '1 day'
) d
left join sales s on s.created_at::date = d::date and s.status = 'closed'
group by d
order by d;

create or replace view kpi_revenue_monthly
  with (security_invoker = true) as
select
  date_trunc('month', created_at)::date as month,
  sum(amount) as month_total
from sales
where status = 'closed'
  and created_at >= date_trunc('month', now()) - interval '5 months'
group by 1
order by 1;

-- ---------- Operação — integrações externas (Auvo e futuras) ----------
-- Guarda só metadados técnicos de integração (token em cache, lock de
-- refresh, timestamps, erros) — nunca os números de negócio do BI, que
-- são sempre consultados em tempo real na API externa. RLS habilitado
-- sem nenhuma policy: só a service role (usada exclusivamente dentro das
-- Edge Functions) acessa, contornando RLS por padrão da plataforma —
-- mesma convenção de customers/sales, mas sem policy alguma (nem para
-- anon, nem para authenticated).

create table if not exists integration_tokens (
  provider text primary key,
  access_token text,
  expires_at timestamptz,
  refresh_claimed_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table integration_tokens enable row level security;

create table if not exists integration_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table integration_events enable row level security;

create index if not exists integration_events_provider_created_idx
  on integration_events (provider, created_at desc);

-- Lock de single-flight: só uma requisição concorrente "ganha" o direito
-- de logar de novo na API externa. INSERT ... ON CONFLICT faz o bootstrap
-- (primeira chamada de um provider cria a linha e já a reivindica) e a
-- cláusula WHERE do DO UPDATE faz o resto: se outra transação já
-- reivindicou a linha há menos de p_claim_ttl_seconds, o UPDATE não roda e
-- nada é retornado — Postgres serializa as duas UPDATEs na mesma linha, a
-- segunda reavalia o WHERE só depois do commit da primeira.
create or replace function claim_token_refresh(p_provider text, p_claim_ttl_seconds int default 20)
returns table (provider text, access_token text, expires_at timestamptz) as $$
  insert into integration_tokens (provider, refresh_claimed_at)
  values (p_provider, now())
  on conflict (provider) do update
    set refresh_claimed_at = now()
    where integration_tokens.refresh_claimed_at is null
       or integration_tokens.refresh_claimed_at < now() - (p_claim_ttl_seconds || ' seconds')::interval
  returning integration_tokens.provider, integration_tokens.access_token, integration_tokens.expires_at;
$$ language sql volatile;

-- Libera o lock se o login na API externa falhar, para não deixar quem
-- está esperando (poll) travado até o fim do TTL do claim.
create or replace function release_token_refresh_claim(p_provider text)
returns void as $$
  update integration_tokens set refresh_claimed_at = null where provider = p_provider;
$$ language sql volatile;

revoke execute on function claim_token_refresh(text, int) from anon, authenticated;
revoke execute on function release_token_refresh_claim(text) from anon, authenticated;

-- ---------- Telemetria (VMpay) — cache de snapshot computado ----------
-- Não existe pg_cron/pg_net neste projeto, então "atualizar a cada 5 min"
-- é resolvido do mesmo jeito que o resto do painel: 1 linha por cache_key
-- com o resultado já cruzado/classificado (não dados brutos de venda),
-- recalculada sob demanda quando expira, com o mesmo lock de single-flight
-- de integration_tokens pra não deixar N usuários abrindo a tela ao mesmo
-- tempo disparar N recálculos contra a VMpay. Genérico por cache_key (não
-- "vmpay_...") de propósito — outro módulo futuro com a mesma necessidade
-- (snapshot pesado, atualizado periodicamente) reaproveita a tabela.
create table if not exists operational_snapshot_cache (
  cache_key text primary key,
  generated_at timestamptz,
  window_from timestamptz,
  window_to timestamptz,
  payload jsonb,
  data_incomplete boolean not null default false,
  refresh_claimed_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table operational_snapshot_cache enable row level security;

create or replace function claim_snapshot_refresh(p_cache_key text, p_claim_ttl_seconds int default 60)
returns table (cache_key text) as $$
  insert into operational_snapshot_cache (cache_key, refresh_claimed_at)
  values (p_cache_key, now())
  on conflict (cache_key) do update
    set refresh_claimed_at = now()
    where operational_snapshot_cache.refresh_claimed_at is null
       or operational_snapshot_cache.refresh_claimed_at < now() - (p_claim_ttl_seconds || ' seconds')::interval
  returning operational_snapshot_cache.cache_key;
$$ language sql volatile;

-- Libera o lock se o recálculo falhar, pra não deixar a próxima leitura
-- travada sem poder tentar de novo até o fim do TTL do claim.
create or replace function release_snapshot_refresh_claim(p_cache_key text)
returns void as $$
  update operational_snapshot_cache set refresh_claimed_at = null where cache_key = p_cache_key;
$$ language sql volatile;

revoke execute on function claim_snapshot_refresh(text, int) from anon, authenticated;
revoke execute on function release_snapshot_refresh_claim(text) from anon, authenticated;

-- ---------- Operação Completa (Auvo customers + equipments) — snapshot local ----------
-- Master data (clientes/equipamentos), não eventos — por isso vale a pena
-- normalizar em tabelas reais com índice, em vez de só um blob jsonb em
-- operational_snapshot_cache (que aqui guarda só o lock/metadados do sync,
-- ver mais abaixo): permite paginação, filtro e agregação no Postgres em
-- vez de carregar tudo pra memória da Edge Function ou do browser.

create table if not exists auvo_customers (
  id bigint generated always as identity primary key,
  auvo_id bigint not null,
  description text,
  legal_name text,
  cpf_cnpj text,
  external_id text,
  address text,
  address_complement text,
  -- Derivados de "address" por regex best-effort (a Auvo não devolve
  -- cidade/estado estruturados) — nulos quando o padrão não bate. Nunca
  -- tratar como dado oficial da Auvo.
  city text,
  state text,
  -- null quando 0/0 (confirmado que a Auvo devolve isso pra cliente sem
  -- geolocalização real, não é uma coordenada válida) — ver
  -- auvo.assetsNormalizer.ts.
  latitude double precision,
  longitude double precision,
  active boolean not null default true,
  segment_id bigint,
  creation_date timestamptz,
  date_last_update timestamptz,
  raw_data jsonb,
  synced_at timestamptz not null default now()
);

create unique index if not exists auvo_customers_auvo_id_idx on auvo_customers (auvo_id);
create index if not exists auvo_customers_active_idx on auvo_customers (active);

alter table auvo_customers enable row level security;

create table if not exists auvo_equipments (
  id bigint generated always as identity primary key,
  auvo_id bigint not null,
  -- null quando a Auvo manda 0 (equipamento sem cliente) OU quando o id
  -- não bate com nenhum auvo_customers.auvo_id sincronizado — sem foreign
  -- key de propósito (ver nota da seção "Operação Completa" na
  -- documentação do sync): uma FK rígida rejeitaria o upsert de um
  -- equipamento cujo cliente ainda não foi sincronizado ou foi removido do
  -- lado da Auvo, e "não bloquear o sync por um órfão" é requisito
  -- explícito. O join com auvo_customers na leitura (ver
  -- auvo_assets_view) já resolve "sem cliente" corretamente nos dois
  -- casos, sem precisar de FK.
  associated_customer_id bigint,
  parent_equipment_id bigint,
  associated_user_id bigint,
  category_id bigint,
  name text,
  identifier text,
  active boolean not null default true,
  creation_date timestamptz,
  -- null quando a Auvo manda a data-sentinela "0001-01-01T00:00:00"
  -- (equipamento sem garantia/expiração configurada) — nunca guardada como
  -- data real.
  expiration_date timestamptz,
  warranty_start_date timestamptz,
  warranty_end_date timestamptz,
  description text,
  url_image text,
  equipment_specifications jsonb,
  raw_data jsonb,
  synced_at timestamptz not null default now()
);

create unique index if not exists auvo_equipments_auvo_id_idx on auvo_equipments (auvo_id);
create index if not exists auvo_equipments_customer_idx on auvo_equipments (associated_customer_id);
create index if not exists auvo_equipments_active_idx on auvo_equipments (active);

alter table auvo_equipments enable row level security;

-- Join único, reaproveitado por /operation/assets e /operation/map — O(n+m)
-- de verdade via hash/merge join do Postgres sobre os índices acima, nunca
-- um cruzamento em memória na Edge Function ou no browser.
create or replace view auvo_assets_view
  with (security_invoker = true) as
select
  e.id as equipment_row_id,
  e.auvo_id as equipment_id,
  e.name as equipment_name,
  e.identifier,
  e.active as equipment_active,
  e.category_id,
  e.parent_equipment_id,
  e.creation_date,
  e.expiration_date,
  e.warranty_start_date,
  e.warranty_end_date,
  e.description,
  e.url_image,
  e.equipment_specifications,
  c.auvo_id as customer_id,
  c.description as customer_name,
  c.active as customer_active,
  c.address as customer_address,
  c.city as customer_city,
  c.state as customer_state,
  c.latitude as customer_latitude,
  c.longitude as customer_longitude
from auvo_equipments e
left join auvo_customers c on c.auvo_id = e.associated_customer_id;

-- Contagem de equipamentos por cliente calculada aqui (agregação no banco,
-- não em memória) — alimenta tanto a listagem de clientes quanto o filtro
-- "Clientes sem máquinas" e o card "Clientes sem máquinas" do overview.
create or replace view auvo_customers_view
  with (security_invoker = true) as
select
  c.*,
  count(e.id) as equipment_count
from auvo_customers c
left join auvo_equipments e on e.associated_customer_id = c.auvo_id
group by c.id;

-- ---------- Cruzamento Auvo × VMpay por patrimônio + consumo ----------
-- Âncora: auvo_equipments.identifier (patrimônio do lado Auvo) casado com
-- vmpay machine.asset_number (confirmado ao vivo: cada venda da VMpay já
-- embute machine.asset_number, então o join de vendas usa o patrimônio
-- normalizado direto, sem depender desta tabela). Esta tabela guarda só o
-- resultado do casamento (pra tela de inconsistências e pro drawer saber
-- se pode mostrar consumo) — nunca corrige patrimônio automaticamente.

create table if not exists machine_patrimony_registry (
  id bigint generated always as identity primary key,
  auvo_equipment_id bigint not null,
  auvo_identifier text,
  normalized_patrimony text not null,
  vmpay_machine_id bigint,
  vmpay_asset_number text,
  vmpay_machine_model_id bigint,
  match_status text not null check (match_status in ('MATCH', 'MATCH_NORMALIZED', 'NOT_FOUND', 'DUPLICATE')),
  candidate_count int not null default 0,
  computed_at timestamptz not null default now()
);

create unique index if not exists machine_patrimony_registry_auvo_idx on machine_patrimony_registry (auvo_equipment_id);
create index if not exists machine_patrimony_registry_patrimony_idx on machine_patrimony_registry (normalized_patrimony);

alter table machine_patrimony_registry enable row level security;

-- Vendas brutas da VMpay, só o necessário pra consumo (allowlist estrita,
-- mesma convenção do resto do projeto). external_sale_id é o vend.id real
-- da VMpay (confirmado ao vivo, não inventado) — chave de idempotência de
-- verdade: reprocessar o mesmo período nunca duplica.
--
-- NÃO é o histórico permanente — é um buffer de ~90 dias (ver
-- getVmpaySalesRetentionDays em vmpay.config.ts e deleteStaleSales em
-- salesSyncService.ts), que alimenta só o detalhamento "consumo por
-- produto" de período recente. O histórico de verdade, sem prazo de
-- validade, é machine_consumption_daily logo abaixo (agregado, poucos KB).
--
-- raw_data (02/09/2026): existia aqui, guardando o payload inteiro da
-- VMpay por venda sem allowlist — nunca lido de volta em código nenhum, e
-- o principal responsável pela tabela chegar a ~912MB num plano Free de
-- 2GB. Removido do INSERT (ver upsertSales); a coluna pode continuar
-- existindo em bancos antigos (nullable, não quebra nada), mas não recebe
-- mais dado novo. Rode `alter table machine_sales drop column raw_data;`
-- manualmente se quiser remover de vez.
create table if not exists machine_sales (
  id bigint generated always as identity primary key,
  external_sale_id bigint not null,
  vmpay_machine_id bigint not null,
  normalized_patrimony text not null,
  occurred_at timestamptz not null,
  product_name text,
  product_category_id bigint,
  quantity numeric not null default 0,
  value numeric,
  raw_data jsonb,
  synced_at timestamptz not null default now()
);

create unique index if not exists machine_sales_external_id_idx on machine_sales (external_sale_id);
create index if not exists machine_sales_patrimony_occurred_idx on machine_sales (normalized_patrimony, occurred_at);
-- Suporta o filtro "occurred_at >= p_since" de refresh_machine_consumption_daily
-- (sem essa, esse filtro sozinho não usa bem o índice composto acima, que
-- lidera por patrimônio) — importante conforme machine_sales cresce pra
-- centenas de milhares/milhões de linhas.
create index if not exists machine_sales_occurred_at_idx on machine_sales (occurred_at);

alter table machine_sales enable row level security;

-- Agregado diário — é o que a Operação Completa consulta pra hoje/ontem/7d/
-- 30d/período customizado (soma de poucas linhas por máquina, nunca varre
-- machine_sales inteira pra montar o total de um período).
create table if not exists machine_consumption_daily (
  normalized_patrimony text not null,
  consumption_date date not null,
  quantity numeric not null default 0,
  sales_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (normalized_patrimony, consumption_date)
);

alter table machine_consumption_daily enable row level security;

-- Reagregação incremental server-side: roda só sobre o intervalo afetado
-- pelo sync mais recente (p_since..p_until), nunca recalcula a tabela
-- inteira — mesmo espírito de claim_snapshot_refresh (operação em lote no
-- Postgres, não linha-a-linha na Edge Function). "Dia" é sempre o dia
-- civil de Brasília, não UTC (mesma preocupação já registrada em
-- resolveDateRange no módulo Operação).
--
-- p_until é obrigatório: um sync incremental grande (backfill) roda em
-- dezenas de chamadas parciais, cada uma cobrindo só um pedaço de dias —
-- sem o teto superior, "occurred_at >= p_since" sozinho reagregava tudo
-- que já tinha sido sincronizado por chamadas ANTERIORES também (a tabela
-- só cresce), e isso estourou statement_timeout do Postgres na prática
-- assim que machine_sales passou de ~300 mil linhas.
drop function if exists refresh_machine_consumption_daily(timestamptz);

create or replace function refresh_machine_consumption_daily(p_since timestamptz, p_until timestamptz)
returns void as $$
  insert into machine_consumption_daily (normalized_patrimony, consumption_date, quantity, sales_count, updated_at)
  select normalized_patrimony, (occurred_at at time zone 'America/Sao_Paulo')::date, sum(quantity), count(*), now()
  from machine_sales
  where occurred_at >= p_since and occurred_at <= p_until
  group by 1, 2
  on conflict (normalized_patrimony, consumption_date) do update
    set quantity = excluded.quantity, sales_count = excluded.sales_count, updated_at = now();
$$ language sql volatile;

revoke execute on function refresh_machine_consumption_daily(timestamptz, timestamptz) from anon, authenticated;

-- Painel gerencial por cliente (Operação Completa): soma o consumo de
-- TODAS as máquinas casadas de um cliente sem nunca puxar as linhas
-- diárias brutas pra Edge Function — um cliente grande (ex.: 300+
-- máquinas × 90 dias) chegaria a dezenas de milhares de linhas só de
-- agregado diário, e ainda mais em machine_sales; a soma acontece aqui,
-- devolve só 1 linha por dia (resumo) ou 1 linha por máquina (breakdown).
create or replace function customer_consumption_daily_summary(p_patrimonies text[], p_start date, p_end date)
returns table (consumption_date date, quantity numeric, sales_count bigint) as $$
  select consumption_date, sum(quantity), sum(sales_count)
  from machine_consumption_daily
  where normalized_patrimony = any(p_patrimonies) and consumption_date between p_start and p_end
  group by consumption_date
  order by consumption_date;
$$ language sql stable;

create or replace function customer_consumption_by_machine(p_patrimonies text[], p_start date, p_end date)
returns table (normalized_patrimony text, quantity numeric, sales_count bigint) as $$
  select normalized_patrimony, sum(quantity), sum(sales_count)
  from machine_consumption_daily
  where normalized_patrimony = any(p_patrimonies) and consumption_date between p_start and p_end
  group by normalized_patrimony;
$$ language sql stable;

revoke execute on function customer_consumption_daily_summary(text[], date, date) from anon, authenticated;
revoke execute on function customer_consumption_by_machine(text[], date, date) from anon, authenticated;

-- ---------- Chamados Auvo por cliente — snapshot local ----------
-- Antes, o painel por cliente chamava a Auvo AO VIVO a cada clique — a
-- Auvo tem dias instáveis (mesmo comportamento já visto na auditoria
-- geral de tarefas) e isso deixava "Chamados" sem carregar. Mesmo remédio
-- já usado pra Auvo equipments/VMpay sales: sincroniza em segundo plano,
-- o painel só lê o que já está aqui — nunca espera a Auvo no clique do
-- usuário. Só os 6 tipos pedidos pro painel gerencial (ver
-- CUSTOMER_PANEL_TASK_TYPES) — os outros tipos não interessam essa
-- feature, não duplicamos o resto.
create table if not exists auvo_tasks_cache (
  id bigint generated always as identity primary key,
  auvo_task_id bigint not null,
  customer_id bigint not null,
  task_type_name text not null,
  technician_name text,
  creation_date timestamptz,
  task_date timestamptz,
  status int,
  finished boolean not null default false,
  check_out_date timestamptz,
  task_url text,
  synced_at timestamptz not null default now()
);

create unique index if not exists auvo_tasks_cache_task_id_idx on auvo_tasks_cache (auvo_task_id);
create index if not exists auvo_tasks_cache_customer_date_idx on auvo_tasks_cache (customer_id, task_date);

alter table auvo_tasks_cache enable row level security;

-- Mesmo lock de single-flight de operational_snapshot_cache, reaproveitado
-- com um cache_key próprio ('auvo_assets_sync') — não é um snapshot jsonb
-- de negócio (esse mora nas tabelas acima), só os metadados/lock da
-- sincronização (sync_started_at/finished_at/status/contagens/erro).

-- ---------- Catálogo de tipos de tarefa (Auvo) ----------
-- A Auvo aceita filtrar tarefas por taskTypeId direto na API (mais barato
-- que buscar tudo do período e separar aqui), mas não tem endpoint de
-- referência pra listar os tipos configurados — só descobrimos id+nome
-- quando uma tarefa daquele tipo já foi buscada ao menos uma vez. Esta
-- tabela guarda esse mapeamento conforme ele é descoberto (gravado de
-- graça a cada /operation/tasks ou /operation/details, ver
-- auvo.provider.ts), pra permitir que as páginas "Chamados" e
-- "Abastecimento Rotina" filtrem direto na Auvo em vez de buscar o
-- período inteiro. Um tipo que nunca teve nenhuma tarefa (ex.: "Chamado
-- logística" até 20/08/2026) simplesmente não tem linha aqui ainda —
-- nunca inventamos um id; a busca cai no caminho lento (de sempre) até
-- esse tipo aparecer pela primeira vez.
create table if not exists auvo_task_type_catalog (
  task_type_name text primary key,
  task_type_id bigint not null,
  updated_at timestamptz not null default now()
);

alter table auvo_task_type_catalog enable row level security;

-- ---------- Pedidos de Preparação de Máquinas × Auvo ----------
-- Handoff de spec (02/09/2026): 1 pedido agrupa N "fichas" (uma por
-- máquina/local); cada ficha gera 1 documento (PDF, guardado no Storage
-- bucket "preparation-documents", nunca só na Auvo) + 1 ticket próprio na
-- Auvo. O pedido é o agrupador, a ficha é a unidade operacional, o ticket
-- pertence à ficha — nunca diretamente ao pedido. Mesmo padrão de RLS do
-- resto do projeto desde integration_tokens: enable row level security
-- sem NENHUMA policy — só a service role (dentro da Edge Function
-- "preparations") acessa; nem anon nem authenticated têm policy alguma.

-- Código legível tipo "PREP-2026-000145" — nada parecido existia no
-- projeto (todas as PKs de resto são uuid/bigint identity, sem serial
-- legível). Sequência própria, reaproveitada como default da coluna
-- (evita round-trip: o Postgres já gera o código no INSERT).
create sequence if not exists preparation_order_code_seq;

create or replace function generate_preparation_code()
returns text as $$
  select 'PREP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('preparation_order_code_seq')::text, 6, '0');
$$ language sql volatile;

revoke execute on function generate_preparation_code() from anon, authenticated;

-- Template do formulário — versionado explicitamente porque uma ficha
-- histórica nunca pode mudar quando o admin edita os campos (seção 6 da
-- spec): cada ficha guarda template_id + template_version na criação, e
-- editar o template cria uma linha nova (version+1, active=true), nunca
-- faz update na antiga. "schema" segue o formato dado na spec seção 5:
-- { fields: [{key,label,type,required,perForm,options}] }.
create table if not exists preparation_form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null,
  schema jsonb not null,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists preparation_form_templates_version_idx
  on preparation_form_templates (name, version);

alter table preparation_form_templates enable row level security;

-- Template v1 (spec seção 5.1) — não é dado de demonstração (por isso
-- aqui em schema.sql, não em seed.sql): sem essa linha o módulo não tem
-- nenhum template ativo pra usar. on conflict faz nada se já rodou antes
-- (mesma idempotência de "create table if not exists").
insert into preparation_form_templates (name, version, schema, active)
values (
  'Ficha de preparação Connect Vending',
  1,
  '{
    "fields": [
      { "key": "contract_number", "label": "Nº Contrato", "type": "text", "required": true },
      { "key": "installation_forecast", "label": "Previsão de instalação", "type": "date", "required": true },
      { "key": "customer_name", "label": "Nome do cliente", "type": "text", "required": true },
      { "key": "cnpj", "label": "CNPJ", "type": "text", "required": true },
      { "key": "installation_address", "label": "Endereço de Instalação", "type": "textarea", "required": true },
      { "key": "internal_location", "label": "Local Interno da Máquina", "type": "textarea", "required": true, "perForm": true },
      { "key": "contact_email", "label": "E-mail de contato", "type": "email", "required": true },
      { "key": "saf_email", "label": "E-mail de acesso ao SAF", "type": "email", "required": true },
      { "key": "business_model", "label": "Modelo de negócio", "type": "single_select", "required": true, "options": ["Comodato"] },
      { "key": "supply_days", "label": "Dias de abastecimento", "type": "multi_select", "required": true,
        "options": ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] },
      { "key": "machine_model", "label": "Modelo da máquina", "type": "single_select", "required": true, "perForm": true, "options": ["Outra"] },
      { "key": "machine_type", "label": "Tipo", "type": "single_select", "required": true, "perForm": true, "options": ["Semi-Automática"] },
      { "key": "system_type", "label": "Tipo de sistema", "type": "single_select", "required": true, "perForm": true, "options": ["Sem sistema"] },
      { "key": "accessories", "label": "Acessórios", "type": "multi_select", "required": true,
        "options": ["Gabinete", "Rede Hídrica", "Chave da Máquina", "Galão", "Chave de teste", "Estabilizador", "Transformador"] },
      { "key": "cup_type", "label": "Tipo de copo", "type": "single_select", "required": true, "options": ["Biodegradável"] },
      { "key": "product_brand", "label": "Marca do produto", "type": "single_select", "required": true, "options": ["3 Corações"] },
      { "key": "coffee_type", "label": "Tipo do café", "type": "single_select", "required": true, "options": ["Premium"] },
      { "key": "standard_layouts", "label": "Layouts Padrões", "type": "multi_select", "required": true,
        "options": [
          "Café Curto", "Café Longo", "Café Espresso", "Café Tradicional Curto", "Café Tradicional Longo",
          "Café Tradicional Intenso (Sl)", "Café Tradicional Suave (Sl)", "Café com Leite", "Café com Leite (Zr)",
          "Café com leite com chocolate", "Mocaccino", "Mocaccino (Zr)", "Mocaccino (Sl)", "Mocaccino (Grão)",
          "Cappuccino", "Cappuccino (Zr)", "Cappuccino Italiano (Grão)", "Cappuccino Italiano (Sl)",
          "Cappuccino com Chocolate", "Chocolate", "Chocolate (Zr)", "Chá de Limão", "Chá de Pêssego",
          "Chá Frutas vermelhas", "Leite", "Água",
          "Café Curto Espresso e Café Curto Espresso Gelado", "Café Longo Espresso e Café Longo Espresso Gelado",
          "Café com Leite Cremoso e Café com Leite Cremoso Gelado", "Cappuccino Cremoso e Cappuccino Cremoso Gelado",
          "Chocolate Quente Cremoso e Chocolate Cremoso Gelado", "Moccaccino e Moccaccino Gelado",
          "Agua Filtrada", "Água Quente", "Água com Gelo", "Gelo"
        ] },
      { "key": "dose_value", "label": "Valor da Dose", "type": "text", "required": false },
      { "key": "observations", "label": "Observações", "type": "textarea", "required": false }
    ]
  }'::jsonb,
  true
)
on conflict (name, version) do nothing;

-- customer_id aponta pro cliente já sincronizado em auvo_customers (não
-- existe — nem precisa existir — uma tabela de clientes própria deste
-- módulo: a Auvo já é a fonte de verdade de cliente aqui, e auvo_customers
-- já é o cache local dela). auvo_customer_id é uma cópia direta de
-- auvo_customers.auvo_id, guardada solta pra criar ticket sem precisar de
-- join — a Auvo só aceita o id numérico dela, nunca o customer_id interno.
create table if not exists preparation_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default generate_preparation_code(),
  customer_id bigint not null references auvo_customers (id),
  auvo_customer_id bigint not null,
  requested_by uuid,
  requested_by_name text,
  requested_by_email text,
  form_count int not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PROCESSING', 'PARTIALLY_SENT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'ERROR', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists preparation_orders_customer_idx on preparation_orders (customer_id);
create index if not exists preparation_orders_created_at_idx on preparation_orders (created_at desc);

alter table preparation_orders enable row level security;

-- external_id é o mesmo padrão de idempotência já usado em machine_sales
-- (external_sale_id) — determinístico ("PREP-2026-000145-F01", nunca
-- aleatório), então um duplo clique/retry/timeout tenta criar a MESMA
-- linha de novo em vez de uma nova, e o índice único below rejeita.
-- UNIQUE(preparation_order_id, sequence) é a proteção real (banco, não só
-- checagem em app) contra corrida de duas fichas nascerem com o mesmo
-- número — risco apontado explicitamente na spec (seção 2).
-- document_path (não document_url): o bucket é privado, então o que fica
-- salvo é o caminho no Storage, nunca uma URL pública direta — a Edge
-- Function gera uma signed URL de curta duração quando alguém pede pra
-- ver o documento.
create table if not exists preparation_forms (
  id uuid primary key default gen_random_uuid(),
  preparation_order_id uuid not null references preparation_orders (id) on delete cascade,
  sequence int not null,
  template_id uuid not null references preparation_form_templates (id),
  template_version int not null,
  internal_location text not null,
  form_data jsonb not null default '{}',
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'READY', 'GENERATING_DOCUMENT', 'CREATING_TICKET', 'SENT_TO_AUVO', 'IN_PROGRESS', 'COMPLETED', 'ERROR')),
  document_path text,
  document_version int not null default 1,
  external_id text not null,
  auvo_ticket_id bigint,
  auvo_ticket_status_id bigint,
  auvo_ticket_status_name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  finalized_by uuid,
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (preparation_order_id, sequence),
  unique (external_id)
);

create index if not exists preparation_forms_order_idx on preparation_forms (preparation_order_id);
create index if not exists preparation_forms_ticket_idx on preparation_forms (auvo_ticket_id);

alter table preparation_forms enable row level security;

-- Auditoria (spec seção 16) — nunca guarda token/credencial em metadata,
-- só o que já é público na tela (quem fez o quê, resposta de erro da
-- Auvo, status anterior/novo).
create table if not exists preparation_logs (
  id uuid primary key default gen_random_uuid(),
  preparation_order_id uuid not null,
  preparation_form_id uuid,
  action text not null,
  user_id uuid,
  user_name text,
  user_email text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists preparation_logs_order_idx on preparation_logs (preparation_order_id, created_at desc);

alter table preparation_logs enable row level security;

-- Bucket privado pros PDFs das fichas — primeira vez que este projeto usa
-- Supabase Storage. "public=false": nunca acessível por URL direta, só
-- via Edge Function com a service role (que ignora RLS por padrão da
-- plataforma, mesma convenção de toda tabela acima) gerando signed URL
-- sob demanda. Sem nenhuma policy em storage.objects de propósito — só
-- service role toca esses arquivos, igual ao padrão do banco.
insert into storage.buckets (id, name, public)
values ('preparation-documents', 'preparation-documents', false)
on conflict (id) do nothing;
