# Helpdesk (protótipo)

Protótipo navegável de um sistema de tickets de atendimento (área do agente + administração), com dados mockados e sem backend.
React 18, TypeScript, Vite, Tailwind CSS v3, react-router v6, Zustand, Radix UI, cmdk, Tiptap, date-fns (pt-BR) e lucide-react.

## Como rodar

```bash
npm install
npm run dev        # http://127.0.0.1:5173  (abre em /kit)
npm run typecheck  # tsc -b
npm test           # vitest run
npm run build      # tsc -b && vite build
```

## Estado da entrega

| Fase | Conteúdo | Situação |
| --- | --- | --- |
| 1 | Setup, tokens, `components/ui/*` e página `/kit` | **Pronta** |
| 2 | Shell (TopBar, NavRail, WorkTabs, busca), Home e Views | Pendente |
| 3 | Tela do ticket completa | Pendente |
| 4 | Novo ticket, Clientes, Organizações, busca | Pendente |
| 5 | Administração | Pendente |
| 6 | Polimento, README final | Pendente |

## Fase 1: o que existe

- **Tokens** em `tailwind.config.ts` (única fonte de verdade) espelhados como variáveis CSS em `src/index.css`.
  `src/lib/tokens.test.ts` falha se os dois divergirem.
- **`src/types/domain.ts`**, **`src/lib/`** (`cn`, `status`, `time`, `useNow`) e **`src/store/useUi.ts`**
  (localStorage apenas para tema, sidebar e colunas das tabelas; fila de toasts fora do `persist`).
- **`src/components/ui/`**: Button, IconButton, SplitButton, Kebab, Menu, Input, Textarea, Field, Checkbox, Switch,
  Select, Combobox (cmdk, com modo assíncrono), TagInput, Badge, StatusBadge, StatusDot, Pill, SlaPill, Avatar,
  Skeleton, Spinner, EmptyState (3 ilustrações SVG inline), Banner, Tabs, Drawer, Modal/ConfirmModal, Toast,
  Tooltip e Table (ordenação, seleção, agrupamento recolhível, kebab, colunas redimensionáveis, skeleton, vazio, erro).
  Tudo é exportado por `@/components/ui`.
- **`/kit`**: catálogo vivo com todos os componentes e estados (normal, foco, inválido, desabilitado, carregando,
  vazio, erro), mais amostras de todos os tokens lidas do CSS em tempo de execução.

## Decisões e desvios do brief

- **StatusBadge "Novo" usa texto escuro**, não branco: branco sobre `status.new` (#F5A04A) dá 2,10:1.
  Vale também para cores de status personalizadas que fiquem abaixo de 4,5:1 com branco.
- **Contraste dos tokens fixados pelo brief.** A borda `line-strong` (#B0B8BE) sobre branco tem 2,01:1, abaixo dos 3:1
  que a WCAG 2.2 pede para componentes de interface. Mantive o token como especificado; o foco (`border-action` +
  `shadow-focus`) e o estado inválido compensam. Se quiser AA estrito nas bordas de campo, a troca é só de token.
- **Toasts no topo à direita**, abaixo da topbar (brief 5.3). Erros ficam até serem fechados; os demais fecham em
  4 s e pausam com mouse ou foco.
- **Sem gradientes e sem animação longa**: o skeleton é um bloco cinza estático (`surface-2`), sem brilho em gradiente.
- **`cn()` não usa tailwind-merge** (os tokens próprios, como `text-sm` e `text-fg`, confundem a heurística dele).
  Duas utilities da mesma propriedade disputam pela ordem do CSS gerado; ao sobrescrever estilo por `className`,
  use o prefixo `!` do Tailwind.
- **Passos de 2, 6 e 10 px** aparecem em padding de campos e badges para fechar exatamente 32 px (campos) e 20 px
  (badges) sem fugir da grade de 4 px nas demais medidas.
- O `Banner` usa seus próprios botões de ação (herdam a cor do tom do aviso), não o `Button`.

## Estrutura

```
src/
  app/          router, providers
  components/
    ui/         componentes base (+ testes ao lado)
    shell/ ticket/ lists/ people/ admin/   (fases seguintes)
  lib/          cn, status, time, useNow
  pages/        Kit e pages/kit/*
  store/        useUi
  types/        domain.ts
```
