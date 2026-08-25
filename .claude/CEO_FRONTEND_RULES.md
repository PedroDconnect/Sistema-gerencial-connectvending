# Regras de Front-end — PainelCEO

Consultar antes de implementar ou alterar qualquer tela. Versão condensada de
`docs/design-system.md` — se um caso não estiver aqui, ver o documento
completo antes de inventar um padrão novo.

## Stack
Vite + React puro, CSS customizado (`src/theme.css` + `src/App.css`). **Sem
Tailwind, sem shadcn/ui.** Não adicionar nenhuma lib de UI/estilo sem o
usuário pedir explicitamente — decisão tomada em 20/08/2026.

## Antes de escrever qualquer CSS novo
1. `grep` em `App.css` por um componente parecido — a classe provavelmente
   já existe (tabela, filtro, badge, modal, drawer, card, botão).
2. Nunca hex direto — sempre `var(--token)` (ver lista abaixo). É o que
   mantém o dark mode funcionando sem esforço extra.
3. Nunca um `font-size`/`padding`/`margin`/`gap` fora das escalas abaixo. Se
   um valor existente fora da escala aparecer no meio do código que você
   está tocando, normalize pro vizinho mais próximo nesse mesmo commit — não
   deixe (nem crie) mais um valor solto.

## Tokens principais (`src/theme.css`)
Superfície: `--page-bg` `--sidebar-bg` `--card-bg` `--card-bg-raised`
`--input-bg` `--border-hairline` `--border-hairline-strong`
Texto: `--text-primary` `--text-secondary` `--text-muted` `--text-faint`
Marca: `--accent` `--accent-hover` `--accent-active` `--accent-soft`
Estado: `--status-good` `--status-warning` `--status-serious`
`--status-critical` (só pra estado de dado — nunca pra "cor da categoria N")
Categóricas (gráfico): `--series-blue/orange/aqua/yellow/magenta/green/violet/red`
Raio: `--radius-lg` (14, card/modal) `--radius-md` (10, input) `--radius-sm` (8, botão pequeno/chip)
Sombra: `--shadow-card`

## Escala de tipografia (px)
`11 · 12 · 13 · 14 · 16 · 18 · 24 · 28` — nada fora disso.
Pesos: `400/500/600/650/700`, sem mais que isso.

## Escala de espaçamento (px)
`2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 24 · 28 · 32`

## Componentes que já existem — reusar, não recriar
- Botão: `.btn .btn--primary/secondary/ghost`, `.icon-btn` (38×38, só ícone)
- Card/KPI: `.card`, `.stat-tile`, `.stat-tile--skeleton` (loading), grid `*-kpi-grid`
- Tabela: `.data-table` + `.ativos-pagination`, célula truncada: `.ativos-table__truncate` + `title`
- Filtro: busca com `useDebouncedValue`, `MultiSelect` (`.multiselect`), alternância `.segmented`, chips `ActiveFiltersBar`
- Status: `.badge .badge--success/warning/danger/info/neutral`
- Modal: drawer lateral (`.drawer*`, detalhe sem perder contexto) **ou** popup central (`.metric-modal-*`, ação com foco total) — escolher pelo peso da interação, não por preferência
- Ficha label/valor: `.drawer-field` (label mutado à esquerda, valor forte à direita)
- Gráfico de linha com tooltip: `RevenueChart`/`DoseTrendChart` (padrão, reusar a técnica de SVG+gradiente+hover, não plotar biblioteca nova)
- Ranking comparativo: `.ranked-bar` (barra horizontal), não gráfico de barras SVG
- Ícone: `<Icon name="..." />` — checar os 28 nomes em `Icon.jsx` antes de desenhar um novo path
- Estado de erro/aviso de carregamento de página: `.state-error-block`/`.state-warning-block`

## Componentes novos (definidos em `docs/design-system.md`, criar sob demanda)
- `.form-field` — label + input + hint/error (§13 do design system)
- Toast (`.toast-viewport`/`.toast`) — feedback de ação pontual, não de
  carregamento de página; implementar o `ToastProvider`/`useToast` só
  quando a primeira tela realmente precisar, não antecipado

## Responsivo — testar sempre nesses 3 pontos
`1400px` (KPI grid → 3 col) · `1100px` (grid do meio → 1 col) · `900px`
(sidebar some, KPI grid → 2 col). Tabela larga: `overflow-x: auto` no
wrapper, nunca no `body`.

## Processo por tela (Etapa 2, uma tela por vez)
1. Ler este arquivo + a seção relevante de `docs/design-system.md`.
2. Implementar reusando os componentes acima — só criar algo novo se
   genuinamente não existir equivalente.
3. Build (`npx vite build`) + lint (`npx oxlint <arquivos tocados>`) antes de
   reportar.
4. **Sem navegador neste ambiente** — pedir print/feedback do usuário depois
   de cada tela implementada, corrigir, só então seguir pra próxima.
5. Nunca editar lógica de negócio/backend nesta etapa a menos que pedido
   explicitamente — é reengenharia visual, não funcional.
