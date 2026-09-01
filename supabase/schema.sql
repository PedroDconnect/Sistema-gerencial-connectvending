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
-- mesma convenção do resto do projeto — raw_data preserva o resto pra
-- auditoria). external_sale_id é o vend.id real da VMpay (confirmado ao
-- vivo, não inventado) — chave de idempotência de verdade: reprocessar o
-- mesmo período nunca duplica.
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
