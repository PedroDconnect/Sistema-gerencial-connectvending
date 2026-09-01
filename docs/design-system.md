# Design System — Painel Gerencial

Este documento formaliza o Design System do Painel Gerencial. **Não é uma reescrita**:
o app já tinha um sistema de cores, tipografia e componentes consistente,
construído organicamente em `src/theme.css` e `src/App.css`. Este documento
audita o que já existe, corrige as inconsistências reais encontradas (ver
"Tipografia") e preenche as lacunas (Toasts, Forms) que não existiam.

Stack: **Vite + React puro, CSS customizado com custom properties**. Sem
Tailwind, sem shadcn/ui, sem biblioteca de componentes — decisão deliberada
(20/08/2026) para não introduzir uma segunda linguagem visual num sistema que
já funciona, em vez de migrar ~40 componentes já construídos e testados.

---

## 1. Cores

Definidas em `src/theme.css` como custom properties, com suporte completo a
claro/escuro: segue `prefers-color-scheme` por padrão, mas pode ser fixado
explicitamente via `data-theme="dark"` ou `data-theme="light"` no `:root`
(usado pelo seletor de tema do app).

### Superfícies e texto

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--page-bg` | `#F4F1EC` | `#1B1D17` | fundo da página |
| `--sidebar-bg` | `#EFEAE1` | `#1F221B` | fundo da sidebar |
| `--card-bg` | `#FFFFFF` | `#22251D` | fundo de cards/modais |
| `--card-bg-raised` | `#EDEAE1` | `#2A2E24` | fundo "elevado" (inputs raised, badge neutro, hover) |
| `--input-bg` | `#F9F8F5` | `#2A2E24` | fundo de inputs |
| `--border-hairline` | `#DDDCD5` | `rgba(244,241,236,.08)` | borda padrão |
| `--border-hairline-strong` | `#CBC9BC` | `rgba(244,241,236,.14)` | borda de destaque (linha ativa em gráfico, cabeçalho de tabela) |
| `--text-primary` | `#252822` | `#F4F1EC` | texto principal |
| `--text-secondary` | `#6B6E67` | `#C9C7B9` | texto secundário |
| `--text-muted` | `#8B8E85` | `#8F9385` | rótulos, legendas |
| `--text-faint` | `#ACAFA6` | `#656A5C` | texto mais discreto (sublabels) |

### Marca / interação

Uma única cor de marca (verde-oliva) para todo elemento interativo — não há
uma "cor secundária" separada; variação de ênfase vem de `--accent-hover`
(hover), `--accent-active` (pressed) e `--accent-soft` (fundo de chip/badge
ativo).

| Token | Claro | Escuro |
|---|---|---|
| `--accent` | `#6F7663` | `#7E8870` |
| `--accent-hover` | `#5B6353` | `#96A184` |
| `--accent-active` | `#454A3D` | `#4B5043` |
| `--accent-soft` | `rgba(111,118,99,.14)` | `rgba(126,136,112,.2)` |

### Estados (sucesso / alerta / erro)

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--status-good` | `#3F8F5C` | `#4FAE72` | sucesso, `badge--success`, tendência positiva |
| `--status-warning` | `#B8862E` | `#D6A445` | alerta, `badge--warning` |
| `--status-serious` | `#C1703F` | `#D6825A` | severidade intermediária (SLA) |
| `--status-critical` | `#B5533F` | `#D6725D` | erro/crítico, `badge--danger`, borda de `state-error-block` |

Não existe um token "neutral" de status separado — `badge--neutral` usa
`--card-bg-raised` + `--text-muted` (superfície, não cor de estado).

### Categóricas (gráficos)

8 cores fixas, mesma família terrosa da marca, ordem estável entre gráficos
(não recalculada por dataset — a série N sempre usa a mesma cor em qualquer
gráfico do app):

`--series-blue` `--series-orange` `--series-aqua` `--series-yellow`
`--series-magenta` `--series-green` `--series-violet` `--series-red`

### Chrome de gráfico

`--grid-hairline` (linhas de grade), `--axis-muted` (rótulos de eixo) — só
usadas dentro de `<svg>`.

**Regra**: nunca usar hex direto em componentes — sempre `var(--token)`. Isso
é o que faz o dark mode funcionar automaticamente em toda tela nova.

---

## 2. Tipografia

`--font-sans: system-ui, -apple-system, "Segoe UI", sans-serif` — única
família, sem serifa/mono no momento (nenhuma tela precisou até agora).

### Achado da auditoria (20/08/2026)

O CSS atual tem **17 valores de font-size diferentes** espalhados sem escala
(9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 24, 26,
28px) — resultado natural de construir tela por tela sem um token compartilhado.

### Escala formal (a partir de agora)

| Token | px | Uso |
|---|---|---|
| `--text-2xs` | 11px | metadados, hint, sublabel de badge |
| `--text-xs` | 12px | corpo denso (tabela, filtro, rótulo de KPI) |
| `--text-sm` | 13px | corpo padrão (botão, tabela, valor de campo) |
| `--text-base` | 14px | título de seção, corpo de destaque |
| `--text-md` | 16px | título de card/modal |
| `--text-lg` | 18px | título de página secundária |
| `--text-xl` | 24px | valor de KPI grande |
| `--text-2xl` | 28px | número hero (ex.: receita total) |

Valores intermediários existentes (10.5, 11.5, 12.5, 13.5, 15, 17, 26px) devem
ser remapeados pro vizinho da escala **na próxima vez que o componente for
tocado** (ver §9 — não é um find-replace global de uma vez, é normalizado
tela por tela conforme a Etapa 2 avança, pra poder validar visualmente cada
mudança).

Pesos em uso: `400` (raro, corpo longo), `500` (padrão), `600` (rótulo,
botão), `650`/`700` (título, valor de destaque). Não formalizar mais que
isso — 4 pesos já cobrem todo caso real do app.

---

## 3. Espaçamento

Já bem mais disciplinado que a tipografia: os valores em uso já giram em
torno de um passo de 2px. Escala formal:

```
2  4  6  8  10  12  14  16  18  20  24  28  32
```

Outliers encontrados na auditoria (3px, 7px, 9px, 13px, 56px) devem ser
reconciliados pro valor mais próximo da escala quando o componente for
tocado — mesma lógica incremental da tipografia.

---

## 4. Radius & Sombra

```css
--radius-lg: 14px   /* cards, modais, drawers */
--radius-md: 10px   /* inputs, botões grandes */
--radius-sm: 8px    /* botão pequeno, chip, icon-btn */
--shadow-card: 0 6px 16px -8px rgba(30,28,20,.12)   /* claro */
--shadow-card: 0 1px 0 rgba(255,255,255,.03) inset, 0 8px 24px -12px rgba(0,0,0,.5)  /* escuro — precisa de um highlight sutil pra não parecer "chapado" */
```

Badges e chips usam `border-radius: 999px` (pill) — não `--radius-*`,
proposital pra diferenciar visualmente de card/input.

---

## 5. Ícones

Sistema próprio em `src/components/Icon.jsx`: SVG inline, `viewBox="0 0 24
24"`, `stroke="currentColor"`, sem preenchimento — nunca emoji como ícone de
UI (já em conformidade com a boa prática). 28 ícones já cobertos: `home`,
`users`, `server`, `gear`, `truck`, `dollar`, `rocket`, `headset`, `trendUp`,
`trendDown`, `percent`, `wallet`, `bell`, `user`, `box`, `bolt`, `filter`,
`calendar`, `chevronDown`, `search`, `close`, `copy`, `refresh`, `download`,
`check`, `eye`, `map`, `pin`, `layers`, `clipboard`.

**Regra**: antes de desenhar um ícone novo, checar essa lista — a maioria das
necessidades de UI (fechar, buscar, filtrar, atualizar, calendário, mapa) já
está coberta.

```jsx
<Icon name="refresh" size={16} />
```

---

## 6. Sidebar & Header

**Sidebar** (`src/components/Sidebar.jsx`, `.sidebar`): fundo `--sidebar-bg`,
suporta grupos expansíveis (usado por "Operação", que agrupa Telemetria +
Operação Completa + Tarefas) — item pai com seta, filhos indentados.

**Header/Topbar** (`.topbar`): título + subtítulo à esquerda
(`.topbar__title`/`.topbar__subtitle`), ações à direita (`.topbar__actions`) —
tipicamente texto de última sincronização + botão "Atualizar dados". Todo
módulo de dados (Telemetria, Operação Completa) segue esse padrão.

```jsx
<header className="topbar">
  <div>
    <h1 className="topbar__title">Nome da Tela</h1>
    <p className="topbar__subtitle">Descrição de uma linha.</p>
  </div>
  <div className="topbar__actions">...</div>
</header>
```

---

## 7. Cards & KPIs

`.card` — base de qualquer bloco de conteúdo (fundo, borda, radius, sombra).
`.stat-tile` — KPI individual (label + valor), com variante
`.stat-tile__value--danger` pra número que indica problema, e
`.stat-tile--skeleton` pro estado de loading (shimmer via `background-size`
animado, não um spinner). Grades de KPI (`.kpi-grid`, `.ativos-kpi-grid`,
`.operacao-kpi-grid`) são sempre `display:grid` responsivo (3 colunas em
telas médias, 2 em mobile).

---

## 8. Botões

```css
.btn            /* base: inline-flex, gap 6px, font-size 13px */
.btn--primary   /* fundo --accent, texto branco */
.btn--secondary /* borda, sem fundo forte */
.btn--ghost     /* sem borda visível até hover */
.btn:disabled   /* opacity .5/.6, cursor default */
.icon-btn       /* botão quadrado 38x38 só com ícone — fechar modal, ação rápida */
.icon-btn__badge /* contador vermelho no canto (ex.: notificações) */
```

Todo botão de ação destrutiva/importante precisa de estado `disabled`
durante a operação assíncrona (padrão já seguido em todo `handleSync`
existente) — nunca deixar clicável duas vezes em paralelo.

---

## 9. Tabelas

`.data-table` — tabela padrão (font-size 13px, `border-collapse: collapse`).
Paginação: `.ativos-pagination` (label "X–Y de Z" + nav com botões
anterior/próximo). Toda tabela do app usa esse par — nenhuma paginação
customizada por tela. Célula truncada com tooltip: `.ativos-table__truncate`
+ atributo `title`.

---

## 10. Filtros

- Busca: input com ícone `search`, debounced (`useDebouncedValue`, ~300ms).
- Seleção múltipla: `MultiSelect` (`.multiselect`) — dropdown com checkboxes.
- Alternância exclusiva: `.segmented` (pills, um `is-active`) — usado em
  presets de período (Hoje/7d/30d) e abas leves dentro de modal.
- Filtros ativos: `ActiveFiltersBar` — chips removíveis individualmente (×
  por valor) + "Limpar tudo", só aparece quando há algo ativo.

---

## 11. Status (badges)

```css
.badge            /* pill, padding 3px 9px, font-size 11px, font-weight 600 */
.badge--success   /* --status-good */
.badge--warning   /* --status-warning */
.badge--danger    /* --status-critical */
.badge--info      /* --accent / --accent-soft — neutro-mas-informativo */
.badge--neutral   /* --text-muted / --card-bg-raised — realmente neutro */
```

Regra de uso: `success/warning/danger` são sempre sobre um *estado de dado*
(sincronizado, atenção, erro) — nunca sobre preferência de UI. `info` é pra
metadado neutro-mas-relevante (ex.: "Casado (normalizado)"). `neutral` é
"não se aplica" (ex.: inativo).

---

## 12. Modais

Dois padrões, escolhidos pelo peso da interação:

- **Drawer lateral** (`.drawer`, `.drawer-section`, `.drawer-field`) — painel
  fixo que desliza da direita, pra detalhe de um item numa lista sem perder o
  contexto da tabela atrás (ex.: `AssetDetailDrawer`).
- **Popup central** (`.metric-modal-backdrop`/`.metric-modal-panel`) — modal
  de verdade com fundo escurecido, pra uma ação/visualização que precisa de
  foco total (ex.: `CustomerPanelDetailModal`, com gráfico + filtro de
  período).

`.drawer-field` é o par label/valor mais reutilizado do app inteiro
(label à esquerda em `--text-muted`, valor à direita em `--text-primary`,
borda inferior fina) — qualquer "ficha" de detalhe deve usar isso em vez de
inventar um layout novo.

---

## 13. Formulários — lacuna preenchida agora

Não existia um padrão de formulário reutilizável (só `Login.jsx` tinha um
`<form>` de verdade; o resto eram inputs soltos). Padrão formal a partir de
agora:

```jsx
<label className="form-field">
  <span className="form-field__label">Nome do campo</span>
  <input className="form-field__input" />
  <span className="form-field__hint">Texto de ajuda opcional.</span>
  {/* erro: <span className="form-field__error">Mensagem de erro.</span> */}
</label>
```

```css
.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-field__label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.form-field__input {
  height: 38px; padding: 0 12px; border-radius: var(--radius-md);
  border: 1px solid var(--border-hairline); background: var(--input-bg);
  color: var(--text-primary); font-size: 13px;
}
.form-field__input:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.form-field__input[aria-invalid="true"] { border-color: var(--status-critical); }
.form-field__hint { font-size: 11px; color: var(--text-muted); }
.form-field__error { font-size: 11px; color: var(--status-critical); }
```

Isso generaliza o padrão que `.operacao-filters__field` já usava informalmente
— mesma estrutura, agora nomeada e com estado de erro/foco definidos (que não
existiam antes).

---

## 14. Notifications / Toasts — lacuna preenchida agora

Não existia nenhum componente de toast — erro/sucesso de operação sempre foi
um bloco fixo na página (`.state-error-block`/`.state-warning-block`, que
continuam existindo pra erro *de carregamento de dados*, isso não muda).
Toast é pra *feedback de uma ação pontual* (ex.: "Sincronização concluída",
"Erro ao salvar") que deve desaparecer sozinho, sem ocupar espaço permanente
no layout.

```css
.toast-viewport {
  position: fixed; bottom: 20px; right: 20px; z-index: 60;
  display: flex; flex-direction: column; gap: 8px; max-width: 360px;
}
.toast {
  display: flex; align-items: flex-start; gap: 10px;
  background: var(--card-bg); border: 1px solid var(--border-hairline);
  border-radius: var(--radius-md); box-shadow: var(--shadow-card);
  padding: 12px 14px; font-size: 13px; color: var(--text-primary);
  animation: toast-in 180ms ease-out;
}
.toast--success { border-color: var(--status-good); }
.toast--warning { border-color: var(--status-warning); }
.toast--danger { border-color: var(--status-critical); }
@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
```

Implementação (`ToastProvider`/`useToast`) entra quando a primeira tela da
Etapa 2 precisar dele de verdade — documentado aqui como padrão visual, o
componente React em si será criado sob demanda pra não adicionar código sem
uso imediato.

---

## 15. Gráficos

Todos os gráficos são SVG customizado (sem lib externa — decisão já tomada
antes deste documento, mantida): `RevenueChart`/`DoseTrendChart` (linha com
área em gradiente + tooltip ao hover + grade horizontal), `Sparkline` (linha
mínima sem eixo), `ChannelDonut` (donut categórico). Ranking comparativo
(ex.: consumo por máquina) usa barra horizontal proporcional
(`.ranked-bar`), não gráfico de barras em SVG — mais legível pra listas
curtas com rótulo longo.

Regra de cor: linha/área principal sempre `--accent`; comparação entre
categorias usa a paleta `--series-*` na ordem fixa; nunca usar
`--status-*` num gráfico neutro (essas cores são reservadas pra estado
bom/alerta/erro, não pra "categoria 3 do gráfico").

---

## 16. Responsividade

Breakpoints em uso: `1400px` (KPI grid cai pra 3 colunas), `1100px` (grid do
meio cai pra 1 coluna), `900px` (sidebar some, KPI grid cai pra 2 colunas).
Tabelas largas usam `overflow-x: auto` no wrapper (`.ativos-table-wrap`),
nunca no `body`. Toda tela nova deve testar nesses 3 pontos de corte no
mínimo.

---

## 17. Regra geral

Nunca hex direto, nunca `px` fora da escala de §2/§3 sem justificativa
registrada em comentário, sempre `var(--token)`. Antes de criar uma classe
nova, procurar em `App.css` se o padrão já existe (grep pelo nome do
componente similar) — a maioria das telas construídas até agora reaproveitou
90%+ de classes já existentes; é raro precisar de algo genuinamente novo.
