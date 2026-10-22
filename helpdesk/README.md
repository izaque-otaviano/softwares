# Helpdesk (protótipo)

Protótipo navegável de um sistema de tickets de atendimento: área do agente (Início, Visualizações, tela do ticket,
Clientes, Organizações, busca) e central de administração (membros, campos, status, gatilhos, macros). Tudo roda no
navegador sobre dados mockados, sem backend e sem persistência.

Stack: React 18, TypeScript, Vite, Tailwind CSS v3, react-router v6, Zustand, Radix UI, cmdk, Tiptap, date-fns (pt-BR),
lucide-react e Vitest.

## Como rodar

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # vitest run
npm run typecheck  # tsc -b --noEmit
npm run build      # tsc -b && vite build (saída em dist/)
```

## Estado da entrega

| Fase | Conteúdo | Situação |
| --- | --- | --- |
| 1 | Setup, tokens, `components/ui/*` e página `/kit` | Pronta |
| 2 | Shell (TopBar, NavRail, abas de trabalho, busca), Home e Visualizações | Pronta |
| 3 | Tela do ticket completa (propriedades, conversa, composer, macros, envio dividido, painéis, eventos) | Pronta |
| 4 | Novo ticket, Clientes, Organizações, busca | Pronta |
| 5 | Administração (Início, Membros/Funções/Grupos, Campos, Status, Gatilhos e editor, Macros) | Pronta |
| 6 | Polimento: skeletons, vazios, erros, atalhos, acessibilidade, responsivo, README | Pronta |

## Mapa de rotas

| Rota | Tela |
| --- | --- |
| `/` | Redireciona para `/agent/home` |
| `/kit` | Catálogo vivo dos componentes e tokens |
| `/agent/home` | Começar agora |
| `/agent/views`, `/agent/views/:id` | Visualizações (6 views com contadores) |
| `/agent/tickets/new`, `/agent/tickets/:id` | Novo ticket e tela do ticket |
| `/agent/customers`, `/agent/customers/:id` | Clientes e perfil |
| `/agent/orgs`, `/agent/orgs/:id` | Organizações e perfil |
| `/agent/search?q=` | Resultados de busca |
| `/admin` | Início da administração |
| `/admin/members`, `/admin/roles`, `/admin/groups` | Pessoas |
| `/admin/fields`, `/admin/statuses` | Campos e status do ticket |
| `/admin/triggers`, `/admin/triggers/new`, `/admin/triggers/:id` | Gatilhos e editor |
| `/admin/macros`, `/admin/macros/new`, `/admin/macros/:id` | Macros e editor |
| `/admin/fora-desta-versao/:slug` e qualquer outra `/admin/*` | "Fora desta versão" |
| qualquer outra | 404 |

## Estrutura de pastas

```
src/
  api/          camada de acesso (mock): tickets, users, orgs, macros, triggers, search, meta, fields, members,
                db.ts (estado em memória) e delay.ts (atraso e falha simulados)
  app/          App, providers, router, AdminLayout
  components/
    ui/         componentes base (+ testes ao lado)
    shell/      AgentLayout, TopBar, NavRail, WorkTabs, GlobalSearch, atalhos, ErrorBoundary
    ticket/     tela do ticket (+ panels/ e CONTRACT.md)
    lists/      tabela de tickets, filtros, colunas, painel de views
    people/     clientes e organizações
    search/     resultados de busca
    admin/      shell e peças da administração (+ lists/, status/, triggers/, macros/)
    a11y/       SkipLink, RouteA11y (título e foco por rota)
  lib/          cn, status, time, useNow, triggers, views, search, useMediaQuery
  mocks/        dados de exemplo (tickets, usuários, orgs, macros, gatilhos, status, campos, views)
  pages/        uma página por rota (+ admin/ e kit/)
  store/        useTickets, useTabs, useStatuses, useUi
  test/         setup do Vitest
  types/        domain.ts
```

## Decisões e desvios do brief

- **StatusBadge "Novo" usa texto escuro**, não branco: branco sobre `status.new` (#F5A04A) dá 2,10:1.
  Vale também para cores de status personalizadas que fiquem abaixo de 4,5:1 com branco.
- **Contraste dos tokens fixados pelo brief.** A borda `line-strong` (#B0B8BE) sobre branco tem 2,01:1, abaixo dos 3:1
  que a WCAG 2.2 pede para componentes de interface. Mantive o token como especificado; o foco (`border-action` +
  `shadow-focus`) e o estado inválido compensam. Texto auxiliar usa `fg-subtle` só onde o contraste fecha.
  Se quiser AA estrito nas bordas de campo, a troca é só de token.
- **Toasts no topo à direita**, abaixo da topbar (brief 5.3). Erros ficam até serem fechados; os demais fecham em
  4 s e pausam com mouse ou foco. A região é `aria-live`.
- **Sem gradientes e sem animação longa**: o skeleton é um bloco cinza estático (`surface-2`); transições até 150 ms.
- **`cn()` não usa tailwind-merge** (os tokens próprios, como `text-sm` e `text-fg`, confundem a heurística dele).
  Duas utilities da mesma propriedade disputam pela ordem do CSS gerado; ao sobrescrever estilo por `className`,
  use o prefixo `!` do Tailwind.
- **Passos de 2, 6 e 10 px** aparecem em padding de campos e badges para fechar exatamente 32 px (campos) e 20 px
  (badges) sem fugir da grade de 4 px nas demais medidas.
- O `Banner` usa seus próprios botões de ação (herdam a cor do tom do aviso), não o `Button`.
- **Acessibilidade medida com axe** (axe-core, regras WCAG 2.0/2.1/2.2 A e AA mais best-practice) em Início,
  Visualizações, ticket, novo ticket, Clientes, Administração, Status e `/kit`: zero violações, **com uma exceção
  conhecida**: nas telas de ticket, o `tablist` das abas de trabalho (`aria-required-children`) segue sinalizado.
  Cada aba é um `tab` seguido de um botão "Fechar aba" dentro do mesmo `tablist`; mantive assim porque o fechamento
  por botão é parte do brief e separar os dois quebraria a navegação por Tab.
- **Responsivo abaixo de 1024 px**: o painel direito do ticket vira `Drawer` e o painel de propriedades vira acordeão
  (`useIsNarrow`). Acima disso o layout é o de desktop do brief (altura total, sem rolagem de página).
- **`ErrorBoundary`** envolve as rotas: erro de renderização vira banner com "Recarregar" em vez de tela branca e é
  limpo ao navegar. Falhas simuladas da API (5 %) viram banner com "Tentar novamente" sem perder o que foi digitado.
- **Atalhos**: `g` `h` (Início), `g` `v` (Visualizações), `/` (busca), `?` (ajuda com a lista), `Ctrl/Cmd + Enter`
  (enviar), `Shift + Enter` na lista de macros (pré-visualizar), `Esc` (fecha menu, popover, painel ou diálogo).
  Não disparam enquanto se digita em campos.
- **Dados em memória que zeram ao recarregar.** Tickets, status, macros, gatilhos etc. vivem em `src/api/db.ts`.
  O `localStorage` guarda só tema, sidebar e colunas das tabelas. Recarregar a página volta ao estado inicial.

## Critérios de aceite (brief, seção 12)

Verificados no navegador real (Chromium via Playwright) em uma única sessão, navegando só pela interface, sem
recarregar entre os passos. O roteiro desliga apenas a falha aleatória de 5 % da API mockada, para ser determinístico.

| # | Critério | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Nota interna não gera notificação por gatilho; resposta pública gera | Passou | Log do ticket com nota: 0 eventos; com resposta pública: "Notificação por e-mail Cliente — Gatilho Notificar solicitante: ticket recebido" |
| 2 | Alternar Resposta pública / Observação interna muda cor e esconde Para/CC; modo persiste após enviar | Passou | Fundo branco para pêssego; "Para" e "CC" somem; depois do envio continua em Observação interna |
| 3 | Macro muda badge, botão e texto sem enviar; Cancelar na pré-visualização não altera | Passou | Badge Novo para Pendente, "Enviar como Pendente", texto preenchido, nº de mensagens igual; Cancelar deixou tudo igual |
| 4 | "Resolvido" no menu da seta envia na hora; sai de "sem resolução", entra em "resolvidos recentemente"; contadores | Passou | Toast "Ticket atualizado"; contadores 27 para 26 e 4 para 5; linha saiu de uma view e entrou na outra |
| 5 | Mesmo cliente duas vezes foca a aba; fechar com pendência pede confirmação | Passou | Nº de abas não mudou na segunda abertura; "Descartar alterações?" ao fechar; Cancelar mantém a aba |
| 6 | Views: ordenar, filtrar, agrupar, colunas, vazio, Exportar CSV | Passou | Ordenação asc/desc conferida; filtro por assunto (1 de 26); grupos Novo/Aberto/Pendente com contagem; coluna removida; "Nenhum ticket nesta visualização"; CSV baixado com cabeçalho e 26 linhas |
| 7 | Status novo em Admin aparece no menu de envio e nos badges sem recarregar | Passou | Criado em `/admin/statuses`, apareceu no menu, no badge do ticket e na lista, indo admin para agente pela UI |
| 8 | Teclado: menus abrem/fecham com Enter/Esc, foco nunca se perde | Passou | 9 gatilhos testados (modo, permanecer, seta de envio, nova aba, produto, macros, select, Ações, drawer): abrem com Enter, fecham com Esc, foco volta ao gatilho; 0 perdas de foco em 40 Tabs |
| 9 | Sem erros de console e sem layout shift perceptível | Passou | 0 erros/avisos de console na sessão inteira; CLS acumulado 0,019 (maior salto 0,006; limite "bom" é 0,1) |

Correção feita na verificação: o nome do CSV exportado perdia letras acentuadas
(`todos-os-tickets-sem-resolu-o.csv`); agora vira `todos-os-tickets-sem-resolucao.csv`.

## Limitações conhecidas e o que não existe

- **Sem backend e sem persistência**: nada sobrevive a recarregar a página; não há login, permissões nem multiusuário.
  "Tempo quase real" é simulado: a cada ~60 s surge um ticket novo ou resposta de cliente.
- **Fora desta versão**: Conta, Canais e Espaços de trabalho (a administração mostra "Fora desta versão"), Conhecimento
  (toast), telefonia (ícone de telefone com toast), artigos na busca, importação em massa de clientes e organizações,
  "Exportar lista" dos membros.
- **Anexos não são enviados**: arrastar, colar ou escolher arquivo mostra o chip com nome e tamanho no composer, mas o
  conteúdo não é guardado nem enviado.
- **Menu ⋮ do ticket**: "Criar como macro" e "Fundir em outro ticket" só mostram toast; "Suspender usuário",
  "Marcar como spam" e "Apagar" pedem confirmação e só mostram toast (não alteram os dados). "Imprimir" usa
  `window.print()`.
- IA (varinha do composer, Copiloto, resumo e campos de IA) é mockada por palavras-chave, sem modelo real.
- Notificações (3 não lidas), contagem de Conversas e presença são valores fixos de demonstração.
- O botão "nova visualização" só abre o modal; a view "Tickets resolvidos recentemente" usa janela de 7 dias sobre a
  data de atualização.

## Ligando a um backend

A camada `src/api/*` é a fronteira: páginas e stores só falam com ela (`ticketsApi`, `usersApi`, `orgsApi`,
`macrosApi`, `triggersApi`, `searchApi`, `metaApi`, `fieldsApi`, `membersApi`), sempre por funções assíncronas que
devolvem os tipos de `src/types/domain.ts`.

1. Hoje cada módulo lê e escreve em `src/api/db.ts` dentro de `simulate()` (atraso e falha de `delay.ts`).
2. Para um backend real, troque o corpo de cada função por `fetch`, mantendo assinatura e tipos de retorno.
3. Um cliente HTTP único (base URL, credenciais, CSRF, tempo limite, tradução de erros para `ApiError`) ficaria em
   `src/api/http.ts`, usado por todos os módulos.
4. Os mapeamentos entre o JSON do servidor e `domain.ts` (nomes de campos, status, datas) ficariam em adaptadores ao
   lado de cada módulo, para o resto do app nunca ver o formato do servidor.
5. Os stores (`useTickets`, `useStatuses`) já expõem estado de erro e recarga; basta a API lançar `ApiError`.
6. Regras hoje locais (gatilhos em `lib/triggers.ts`, contadores das views em `lib/views.ts`) passam a vir do servidor.
7. A simulação de tempo quase real (`startLiveUpdates`) deve ser trocada por polling, SSE ou WebSocket.
8. Autenticação entraria em `app/providers.tsx`, que também trataria resposta 401 de forma global.
9. Os testes de `src/api/api.test.ts` servem de contrato: rode-os contra os adaptadores novos.
10. `db.ts`, `delay.ts` e `src/mocks/*` podem ficar só para testes e demonstração.
