-- Optional demo data for local testing. Run once, after schema.sql.
-- Generates ~60 customers and ~900 deals spread over the last 6 months,
-- weighted so revenue trends upward toward the present (to exercise the
-- Diário/Semanal/Mensal views) and channel mix roughly matches direct >
-- ecommerce > marketplaces > partners.

insert into customers (name, email, industry, company_size, created_at)
select
  'Cliente ' || gs,
  'cliente' || gs || '@exemplo.com',
  (array['Varejo', 'Tecnologia', 'Saúde', 'Educação', 'Financeiro', 'Indústria'])[1 + floor(random() * 6)],
  (array['Pequena', 'Média', 'Grande'])[1 + floor(random() * 3)],
  now() - (floor(random() * 180) || ' days')::interval
from generate_series(1, 60) gs;

insert into sales (customer_id, title, amount, status, channel, created_at, closed_at)
select
  (select id from customers order by random() limit 1),
  'Negócio ' || gs,
  round((300 + random() * 4200) * (1 + (180 - days_ago) / 180.0))::numeric(14, 2),
  case
    when r < 0.55 then 'closed'
    when r < 0.85 then 'open'
    else 'lost'
  end,
  case
    when rc < 0.45 then 'direct'
    when rc < 0.72 then 'ecommerce'
    when rc < 0.90 then 'marketplaces'
    else 'partners'
  end,
  now() - (days_ago || ' days')::interval,
  case
    when r < 0.55 then now() - (days_ago || ' days')::interval
    else null
  end
from (
  select
    gs,
    floor(random() * 180) as days_ago,
    random() as r,
    random() as rc
  from generate_series(1, 900) gs
) t;
