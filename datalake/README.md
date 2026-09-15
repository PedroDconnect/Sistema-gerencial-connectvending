# Data lake de chamados (Auvo -> Backblaze B2)

Por que isso existe: o painel ConnectFast (e qualquer outra tela) consulta a
Auvo **ao vivo** a cada request, limitado a 31 dias por chamada
(`MAX_DATE_RANGE_DAYS` em `supabase/functions/operation/service/filters.ts`).
Isso é rápido o bastante pra um filtro de "hoje"/"7 dias", mas inviável pra
puxar meses de histórico de uma vez — daí este pipeline separado, em Python,
rodando via GitHub Actions (sem o limite de tempo de execução de uma Edge
Function), que busca tudo direto da Auvo e guarda como arquivo no Backblaze
B2, uma vez por mês.

## O que é gravado

Um objeto por mês, cada linha um chamado (payload **bruto** da Auvo, sem
normalização — decisão deliberada: esta é a camada "raw" do data lake;
qualquer agregação/curadoria pro dashboard vem depois, como uma etapa
separada, quando houver uma necessidade concreta de consulta):

```
s3://<bucket>/auvo-tasks/raw/2026/2026-01.ndjson.gz
s3://<bucket>/auvo-tasks/raw/2026/2026-02.ndjson.gz
...
```

Cada linha: `{"_fetched_at": "...", "_source": "auvo", "task": {...payload bruto...}}`.

## Configuração necessária (uma vez)

No GitHub do repositório, em **Settings → Secrets and variables → Actions**:

**Secrets** (nunca aparecem em log, nem eu preciso vê-los):
| Nome | Valor |
|---|---|
| `AUVO_API_KEY` | mesma credencial já usada no Supabase (`AUVO_API_KEY` nas Edge Functions) |
| `AUVO_API_TOKEN` | mesma credencial já usada no Supabase (`AUVO_API_TOKEN`) |
| `B2_APPLICATION_KEY_ID` | Application Key ID gerada no Backblaze B2 (recomendado: uma key nova, com permissão só nesse bucket) |
| `B2_APPLICATION_KEY` | Application Key correspondente |

**Variables** (não sensíveis, ficam visíveis nos logs):
| Nome | Valor |
|---|---|
| `B2_BUCKET_NAME` | nome do bucket já criado no Backblaze |
| `B2_REGION` | região do bucket, ex. `us-west-002` — está na página do bucket no painel do Backblaze |

## Rodar o backfill histórico (uma vez)

GitHub → aba **Actions** → workflow **"Auvo Data Lake - Backfill"** → **Run workflow**:
- `start_month`: `2026-01` (já vem assim por padrão)
- `end_month`: deixe vazio pra ir até o mês atual
- `force`: só marque se quiser refazer um mês que já existe no bucket

O job roda os meses **em sequência** (não em paralelo) de propósito — a
própria Auvo fica instável com muita concorrência simultânea (confirmado
empiricamente no código do painel: 16 requisições ao mesmo tempo já derruba
a API deles; usamos 8, dentro de cada mês). Rodar meses em paralelo via
matrix multiplicaria essa concorrência e provavelmente pioraria as coisas.

O job é **retomável**: se um mês falhar (ex.: Auvo instável demais naquele
dia), ele é reportado no final e o job termina com erro, mas os meses que já
deram certo ficam gravados. Rodar de novo (sem `force`) pula os que já
existem e tenta só os que faltaram.

Estimativa grosseira (baseada em ~5.100 tarefas/7 dias observados no painel):
um mês "cheio" pode ter dezenas de milhares de tarefas — espere de alguns
minutos a algumas dezenas de minutos por mês. Um backfill de janeiro até
hoje deve levar entre 30 minutos e algumas horas; o timeout do job está em
300 minutos.

## Sincronização diária

Workflow **"Auvo Data Lake - Sync Diario"**, agendado pra rodar sozinho
todo dia às 06:00 UTC (03:00 em Brasília). Ele **sobrescreve** o mês atual e
o anterior (não é "append" — status de tarefa muda com o tempo, então o
snapshot do mês precisa ser refeito, não só complementado). Meses mais
antigos que isso já estão "fechados" e não são tocados de novo — se algum
dia precisar reprocessar um mês antigo específico (ex.: encontrou um bug na
normalização, ou a Auvo corrigiu um dado retroativamente), rode o backfill
manual com `force` só naquele mês.

Pode disparar manualmente também (aba Actions → esse workflow → Run workflow).

## O que NÃO está feito ainda

- **Ligar isso de volta no painel** (consultas de tendência histórica além
  de 31 dias no ConnectFast) — este pipeline só _guarda_ o histórico bruto;
  consumir esse histórico no dashboard é um passo separado, ainda não
  decidido (provavelmente uma tabela agregada no Supabase, alimentada a
  partir do que está no B2, no mesmo espírito de `machine_consumption_daily`).
- Nenhuma camada "curada"/normalizada — só o raw JSON da Auvo, gzip por mês.
