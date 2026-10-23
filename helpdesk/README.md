# Helpdesk (protótipo)

Protótipo navegável de um sistema de tickets de atendimento: área do agente (Início, Visualizações, tela do ticket,
Clientes, Organizações, busca) e central de administração (membros, campos, formulários, status, gatilhos, macros). Tudo roda no
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
| 5 | Administração (Início, Membros/Funções/Grupos, Campos, Formulários, Status, Gatilhos e editor, Macros) | Pronta |
| 6 | Polimento: skeletons, vazios, erros, atalhos, acessibilidade, responsivo, README | Pronta |

## Mapa de rotas

| Rota | Tela |
| --- | --- |
| `/` | Redireciona para `/agent/home` |
| `/login` | Entrar (só no modo real; no mock redireciona) |
| `/kit` | Catálogo vivo dos componentes e tokens |
| `/agent/home` | Começar agora |
| `/agent/views`, `/agent/views/:id` | Visualizações (6 views com contadores) |
| `/agent/tickets/new`, `/agent/tickets/:id` | Novo ticket e tela do ticket |
| `/agent/customers`, `/agent/customers/:id` | Clientes e perfil |
| `/agent/orgs`, `/agent/orgs/:id` | Organizações e perfil |
| `/agent/search?q=` | Resultados de busca |
| `/admin` | Início da administração |
| `/admin/members`, `/admin/roles`, `/admin/groups` | Pessoas |
| `/admin/fields`, `/admin/forms`, `/admin/statuses` | Campos personalizados, formulários e status do ticket |
| `/admin/triggers`, `/admin/triggers/new`, `/admin/triggers/:id` | Gatilhos e editor |
| `/admin/macros`, `/admin/macros/new`, `/admin/macros/:id` | Macros e editor |
| `/admin/fora-desta-versao/:slug` e qualquer outra `/admin/*` | "Fora desta versão" |
| qualquer outra | 404 |

## Estrutura de pastas

```
src/
  api/          fachadas por recurso (tickets, users, orgs, macros, triggers, search, meta, fields, members, auth),
                capabilities.ts; mock/ (db em memória, delay, dados de exemplo) e real/ (http.ts, auth.ts, refs.ts, local.ts, mappers/, leitura por recurso)
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
  pages/        uma página por rota (+ admin/ e kit/)
  store/        useSession, useTickets, useTabs, useStatuses, useRefData, useUi
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
  Visualizações, ticket, novo ticket, Clientes, Administração, Status e `/kit`: zero violações (medição anterior às
  abas atuais; não foi refeita). As abas de trabalho agora são um `role=group` com botões e `aria-current` (antes
  `tablist`/`tab`, que o axe sinalizava por causa do botão "Fechar aba" dentro do `tablist`): some a violação, mas as
  abas perdem a semântica de aba.
- **Responsivo abaixo de 1024 px**: o painel direito do ticket vira `Drawer` e o painel de propriedades vira acordeão
  (`useIsNarrow`). Acima disso o layout é o de desktop do brief (altura total, sem rolagem de página).
- **`ErrorBoundary`** envolve as rotas: erro de renderização vira banner com "Recarregar" em vez de tela branca e é
  limpo ao navegar. Falhas simuladas da API (5 %) viram banner com "Tentar novamente" sem perder o que foi digitado.
- **Atalhos**: `g` `h` (Início), `g` `v` (Visualizações), `/` (busca), `?` (ajuda com a lista), `Ctrl/Cmd + Enter`
  (enviar), `Shift + Enter` na lista de macros (pré-visualizar), `Esc` (fecha menu, popover, painel ou diálogo).
  Não disparam enquanto se digita em campos.
- **Dados em memória que zeram ao recarregar (modo mock).** Tickets, status, macros, gatilhos etc. vivem em `src/api/mock/db.ts`.
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
- **Anexos (modo mock) não são enviados**: arrastar, colar ou escolher arquivo mostra o chip com nome e tamanho no composer, mas o
  conteúdo não é guardado nem enviado.
- **Menu ⋮ do ticket**: "Criar como macro" e "Fundir em outro ticket" só mostram toast; "Suspender usuário",
  "Marcar como spam" e "Apagar" pedem confirmação e só mostram toast (não alteram os dados). "Imprimir" usa
  `window.print()`.
- IA (varinha do composer, Copiloto, resumo e campos de IA) é mockada por palavras-chave, sem modelo real.
- Notificações (3 não lidas), contagem de Conversas e presença são valores fixos de demonstração.
- O botão "nova visualização" só abre o modal; a view "Tickets resolvidos recentemente" usa janela de 7 dias sobre a
  data de atualização.

## Ligando ao backend Resolv (modo real)

Dois modos, escolhidos por `VITE_API_MODE` (ver `.env.example`):

| Modo | Como | O que acontece |
| --- | --- | --- |
| `mock` (padrão) | `npm run dev` | Dados de exemplo em memória, login automático como o agente `me`, sem tela de login. Testes rodam sempre aqui. |
| `real` | `npm run dev:real` | Login em `/login` (e-mail e senha, 2FA opcional), sessão por cookie + CSRF contra o Resolv em `VITE_API_PROXY` (padrão `http://127.0.0.1:8000`). |

- O Vite faz proxy de `/api` e `/ws` (WebSocket) para o backend: mesma origem, sem CORS. Deixe `VITE_API_URL` vazio
  e acesse sempre por `http://127.0.0.1:5173`.
- Só contas de agente/administrador entram; conta de cliente é recusada com mensagem. 401 em qualquer chamada volta
  ao `/login` e, depois de entrar, ao destino anterior.
- Estrutura: `src/api/<recurso>.ts` são fachadas que escolhem `mock/` ou `real/`; `real/http.ts` é o cliente HTTP
  (CSRF, erros, paginação, 401); `real/<recurso>.ts` LEEM e ESCREVEM no backend (etapas 2 a 4); `real/mappers/*` são os
  mapeadores puros: DTO do Resolv para os tipos do Helpdesk (leitura) e `outbound.ts`/`htmlToMarkdown.ts` (ida: plano de
  chamadas, janela de fechamento, corpos, HTML do editor para markdown), todos testados com fixtures reais em
  `real/__fixtures__`; `real/refs.ts` cacheia status, equipes, usuários e
  empresas; `real/local.ts` guarda as alterações locais; `src/api/mock/` guarda o banco em memória e os dados de exemplo. Nada fora de `src/api` importa `mock/`
  (garantido por `src/api/architecture.test.ts`). O usuário logado vem de `useSession` (`useMeId()`/`getMeId()`).
- Decisão do dono: nada é escondido. O que o backend não tem continua funcionando localmente (em memória, some ao
  recarregar) e está registrado em `src/api/PENDENTE_NO_BACKEND.md` e no objeto `capabilities` (`'real' | 'local'`).
- Mensagens trafegam em markdown no backend; o front converte nas bordas (leitura: `marked` + `sanitizeHtml`; escrita:
  `htmlToMarkdown`, serializador próprio do HTML do Tiptap, sem dependência nova; ida e volta testada).
- Etapas 2 a 4 (leitura e escrita reais): Início, Visualizações, tela do ticket (criar, responder, nota interna, status,
  fechar, atribuir, prioridade, etiquetas, seguir, macro, anexos), ações em lote, Clientes, Organizações, Busca e Admin
  (Membros, Status, Macros) leem e gravam no Resolv. O envio do ticket orquestra de 1 a 4 chamadas sem transação, com
  relato de falha parcial e "Tentar novamente" que não duplica o que já passou. Tipo, apagar/restaurar, CC e seguidores de
  terceiros, licenças, resumo de IA, **campos personalizados e formulários** (só equipe) também vão ao backend. O que ele
  não tem (gatilhos, fusão, campos de IA do painel) segue
  LOCAL e avisa "somente neste navegador" só nesses pontos. Decisões, o que escreve de verdade e o que segue local:
  `src/api/PENDENTE_NO_BACKEND.md`.
