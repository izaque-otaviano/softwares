# Pendente no backend (Resolv)

Decisão do dono: nada é escondido. O que o backend Resolv não tem **continua funcionando localmente** (híbrido:
estado em memória no navegador, perdido ao recarregar) e fica registrado aqui e em `capabilities`
(`src/api/capabilities.ts`: `'real'` = vai ao backend, `'local'` = roda no navegador). O backend não muda.

Consulta em código:

```ts
import { capabilities, pendingCapabilities } from '@/api';
capabilities.triggers; // 'local'
pendingCapabilities(); // chaves ainda locais
```

No modo `mock` tudo é `'local'`. No modo `real` o estado é `src/api/real/capabilities.ts`; quem implementar um
recurso contra o backend troca a entrada para `'real'`.

## Estado atual (etapas 2 a 4: LEITURA e ESCRITA reais)

Com `VITE_API_MODE=real` (`npm run dev:real`) as telas leem E gravam no Resolv (`capabilities.writes = 'real'`). A faixa
global de aviso sumiu; a ressalva "somente neste navegador" aparece SÓ nos recursos listados em "Sem equivalente no
backend" (dicas nos campos, faixas nas telas de Gatilhos e Campos, avisos de fusão/apagar) e nos campos soltos de uma
edição (`Ticket.localFields`).

| Chave | Situação | De onde vem |
| --- | --- | --- |
| `auth` | real | `/auth/login/`, `/auth/2fa/`, `/auth/me/`, `/auth/logout/`. |
| `tickets` | real (leitura) | `GET /tickets/` (lista inteira, paginada) e `GET /tickets/{id}/` (detalhe sob demanda). |
| `views` | real (leitura) | `GET /tickets/resumo/` (contadores), `GET /ticket-views/` (pessoais), `GET /tickets/?view=<slug>` (visões do sistema extras e pessoais, avaliadas no servidor). |
| `statuses` | real (leitura) | `GET /settings/statuses/` (stages; a categoria `closed` = Resolvido, `pending_customer` = Pendente). |
| `groups` | real (leitura) | `GET /settings/teams/roster/` (cai em `/teams/` sem permissão). |
| `users` | real (leitura) | `GET /settings/users/?kind=client` e `kind=internal` (cai em `/users/`). |
| `orgs` | real (leitura) | `GET /settings/companies/` (cai em `/companies/`). |
| `macros` | real (leitura) | `GET /settings/ticket-macros/` (corpo markdown vira HTML sanitizado). |
| `search` | real (leitura) | `GET /search/?q=` (prévia da busca global), `GET /tickets/?q=` (página de resultados). |
| `members` | real (leitura) | `GET /settings/users/?kind=internal` + roster (membros, funções e grupos do Admin). |
| `writes` | real (etapas 3 e 4) | Ver "Escritas reais" abaixo. |

### Escritas reais (etapas 3 e 4)

| Ação no Helpdesk | Chamadas ao backend |
| --- | --- |
| Criar ticket | `POST /tickets/` (multipart se houver anexos: equipe, assunto, corpo em markdown, prioridade, solicitante) + `PATCH` (responsável, etiquetas) + `follow` + `apply-macro` + `bulk-status`/`close` (status), só as que forem necessárias |
| Responder (público) | `POST /tickets/{id}/reply/` com `new_status` derivado do status escolhido (`open`, `pending_customer`, `closed`; "Novo" vira `open`), markdown e anexos em multipart |
| Observação interna / chamada | `reply` com `is_public:false` (não muda status) |
| Mudar status | categoria igual à do stage de fábrica: `reply`; stage personalizado: `reply` + `bulk-status`; sem texto: `bulk-status` (novo/aberto/pendente) ou `close/` (resolvido) |
| Fechar | `close/` ou `reply` com `new_status:closed`, sempre com a janela da solução (abaixo) |
| Atribuir / aceitar, prioridade, grupo, etiquetas | um `PATCH /tickets/{id}/` (`assignee`, `priority`, `team`, `tags` por id) |
| Seguir / deixar de seguir | `follow/` e `unfollow/` (só o próprio usuário) |
| Macro | `apply-macro` no envio (soma categoria/prioridade/responsável/etiquetas e registra o evento); o texto é inserido no compositor com `{{solicitante}}`, `{{empresa}}`, `{{referencia}}` preenchidos |
| Ações em lote | `bulk-assign`, `bulk-priority`, `bulk-status`; "resolvido" = um `close/` por ticket; falhas por ticket em `failed[]` |
| Admin: status | `POST/PATCH /settings/statuses/` (nome, cor hex, categoria na criação, `is_active`) |
| Admin: macros | `POST/PATCH/DELETE /settings/ticket-macros/` (corpo markdown, prioridade, etiquetas por id, ativo) |
| Admin: membros | `POST /settings/teams/{id}/agents/` (com grupo) ou `POST /settings/users/` (interno); o backend envia o convite. Suspender = `is_active:false` |
| Organizações | `POST/PATCH/DELETE /settings/companies/` (slug derivado do nome, plano escolhido no modal; apagar = desativar, some da lista) |
| Clientes | `POST/PATCH/DELETE /settings/users/` (exige organização e telefone, pedidos no modal; apagar = desativar) |
| Etiquetas | criadas por `POST /settings/tags/` quando o ticket/macro usa um nome novo (só administrador; agente é avisado antes de qualquer escrita) |

Ainda LOCAIS no modo real (em memória, somem ao recarregar; marcados "somente neste navegador"): assunto, solicitante,
tipo, CC, campos personalizados e seguidores de outras pessoas num ticket (camada `layers.ticketPatches`); nome do status
para o usuário final e descrição; descrição, "disponível para", ação de status e nota interna da macro; tags, grupo
padrão e "acesso dos usuários" da organização; tags, notas, contatos extras, idioma e fuso do cliente; apagar e fundir
ticket, usuário e organização; gatilhos, campos, formulários, resumo de IA, licenças. Visões pessoais (criar/editar/
ordenar), abas abertas e itens recentes seguem como antes.

### Decisões das escritas (etapas 3 e 4)

- **Sem transação entre chamadas.** `planTicketUpdate` (`real/mappers/outbound.ts`, pura e testada) monta os passos na
  ORDEM SEGURA: macro, propriedades (idempotentes e validadas cedo), seguir, mensagem (a única que duplica se repetida),
  estágio personalizado. Falha no meio vira `PartialUpdateError`: "Aplicado: prioridade, etiquetas. Não aplicado:
  mensagem. Motivo: ...". O formulário mantém o texto ainda não gravado, trata o que valeu como aplicado (`original`) e o
  "Tentar novamente" refaz o plano contra o estado do servidor, mandando SÓ o que falta (mensagem já gravada não volta;
  ticket criado a meio vira a aba do ticket real e a repetição atualiza, nunca cria outro). Resposta perdida (rede/5xx)
  na mensagem: confere o ticket antes de permitir repetir. Toast de sucesso: "Ticket #N foi atualizado".
- **Fechar (D4).** O backend exige `resolution_started_at`/`resolution_ended_at` (criação <= início <= fim <= agora, no
  minuto) e soma a janela na franquia de horas de manutenção da empresa. O Helpdesk não tem esses campos e NÃO abre
  diálogo: usa a sugestão que o próprio backend documenta (D4): início = primeira transição para "Aberto" do ciclo atual
  (depois da última reabertura), senão a criação; fim = agora no minuto. Em lote cada ticket tem a sua janela (`close/`
  por ticket). Se o relógio do navegador estiver adiantado em mais de 1 min o backend responde "Término no futuro" e a
  mensagem aparece. Próximo passo possível: diálogo de confirmação com os dois horários editáveis.
- **Reabrir** só por resposta pública: mudar de "resolvido" para outro status sem mensagem é recusado ANTES de qualquer
  chamada, com a explicação. Responder publicamente num ticket fechado reabre (`new_status:open`).
- **Descrição como observação interna** em ticket novo não existe (o `POST` publica o corpo): é recusado antes de criar,
  para nunca vazar texto interno ao cliente.
- **Corpo das mensagens: HTML do Tiptap -> markdown** (`mappers/htmlToMarkdown.ts`). Escolha: serializador próprio sobre
  `DOMParser` (~200 linhas, sem dependência). `turndown` (~30 kB), `prosemirror-markdown` (+ markdown-it) e
  `tiptap-markdown` (terceiros) duplicariam o `marked` da leitura e o Tiptap v2 não traz serializador oficial; o editor só
  gera um conjunto fechado de tags e o backend só entende um subconjunto. Cobre negrito, itálico, listas (aninhadas),
  citação, código (linha e bloco), título, divisor, link seguro (http/https/mailto; o resto vira texto) e quebra de
  linha; escapa só o que viraria marcação; sublinhado, imagem e tabela viram texto. Ida e volta testada com a leitura
  (`marked` + `sanitizeHtml`) em `htmlToMarkdown.test.ts`. A tela do Resolv só renderiza negrito/itálico/listas/links;
  citação, código e título aparecem como o texto markdown ali (no Helpdesk renderizam).
- **Anexos** viajam em multipart (`files`) no `reply` e no `POST /tickets/`; o servidor valida tipo/tamanho ANTES de
  gravar (400 não grava nada: texto e arquivos ficam no formulário). Anexo sem texto é recusado (o corpo é obrigatório).
- **Gatilhos: motor local DESLIGADO no modo real.** Rodava no navegador e gravaria mudanças/eventos "simulados" sobre
  tickets reais (que o servidor não conhece e que sumiriam). Os gatilhos continuam editáveis (faixa "somente neste
  navegador, não disparam"). No mock tudo segue como antes.
- **Permissões.** 403 vira "Você não tem permissão para esta ação." + motivo do backend (telas de Admin e envio mantêm o
  que foi digitado). `settings.manage` ausente: criar etiqueta é recusado sem chamar o backend.
- **Contadores** do servidor são recarregados depois de cada escrita; a store não perde mensagens já carregadas quando a
  lista enxuta volta (`keepDetails`).

### Problemas do backend encontrados nas escritas (sem mudar o backend)

1. `POST /tickets/` só aceita equipe, assunto, corpo, prioridade e solicitante, e o corpo vira mensagem PÚBLICA:
   responsável, status, etiquetas e seguir exigem 1 a 3 chamadas extras e não há como criar com nota interna.
2. `bulk-close` usa UMA janela para todos e recusa o lote inteiro se algum ticket foi criado depois do início: o
   Helpdesk fecha ticket a ticket. Não há endpoint que devolva a janela sugerida (D4); a janela entra na franquia de
   manutenção, então um default mal escolhido altera consumo de horas.
3. `bulk-priority` ignora em silêncio ids que não existem/não enxerga (não aparecem em `failed[]`).
4. `PATCH /settings/statuses/{id}/` aceita `is_active:false` num status de FÁBRICA (o `DELETE` recusa); trocar a categoria
   de um status personalizado também passa. Nomes de status repetidos são aceitos.
5. `me.permissions` do agente inclui `macro.manage`, mas `POST /settings/ticket-macros/` responde 403 "Apenas
   administradores"; a lista de permissões não reflete a regra real.
6. Fechar sempre cai no stage de fábrica "Fechado": um stage personalizado da categoria fechada não é alcançável.
7. `POST /settings/companies/` exige `slug` (o front precisa derivar) e `plan`; cliente exige `company` e telefone. O
   convite é enviado na criação (sem `invite_status` além de pendente/aceito).
8. Login: throttle de 20/h e `axes` atrapalham automação de testes (429), sem cabeçalho `Retry-After` legível na UI.

### Decisões da leitura real (etapa 2)

- **Carregar tudo x filtrar no servidor.** A store do Helpdesk guarda todos os tickets (Home, painel do cliente,
  Clientes/Organizações e contadores dependem disso), então a lista é carregada inteira: `limit=500`, a 1ª página traz o
  `count` e as demais vão em paralelo, com teto de 5000 (`MAX_TICKETS`; acima disso um aviso no console e
  `loadInfo.truncated`). As 6 visões do Helpdesk são avaliadas no navegador sobre essa lista (`conditions`); o que o
  servidor sabe contar exato (`meus-nao-resolvidos`, `nao-atribuidos`, `nao-resolvidos`, "pendentes") vem dele, e as
  demais ("atualizados recentemente", "resolvidos recentemente": o backend não filtra por `updated_at`, o `periodo` é
  por abertura) são contadas localmente. As visões do sistema sem par (`todos`, `sem-atendimento`, `aguardando-voce`,
  `mencionam-voce`, `resolvidos`, `internos`, `em-kanban`) e as pessoais têm `View.query` e a lista vem do servidor
  (`runView`) só ao abrir a visão. Para milhares de tickets o próximo passo é paginar por visão em vez de carregar tudo.
- **Custo medido (dados do seed, 6 tickets).** Home = 9 chamadas à API (tickets 1, status 1, visões 1, resumo 1,
  clientes 1, agentes 1, empresas 1, contagem de "pendentes" 1, roster 1) e 0 chamadas ao detalhe; abrir um ticket =
  1 a 2 `GET /tickets/{id}/`; abrir uma visão do servidor = 1 `GET /tickets/?view=`.
- **Solicitante (a lista não traz `requester_id`/`company_id`).** Casamento SEGURO por nome + empresa contra o
  diretório de clientes (só vale se houver exatamente UM cliente assim). Homônimos, nomes sem correspondência ou
  diretório sem permissão: resolve pelo detalhe do ticket (`requester.id`), 6 em paralelo, cacheado por ticket. Ticket
  com conteúdo restrito (`content_hidden`, solicitante "Usuário protegido") fica com `requesterId = ''` e mostra o nome.
- **Autor da mensagem (o backend não manda `author_id`).** `author_name` + `author_is_internal` casados com o diretório
  certo (agentes ou clientes) e só se o casamento for ÚNICO; o solicitante do ticket tem prioridade. Sem casamento
  seguro (homônimos, usuário desativado/anonimizado, mensagem de sistema) `authorId` vira `name:<nome>` (nunca colide
  com um id real) e a tela mostra `Comment.authorName`/`authorAvatarUrl`. Pedido ao backend: `author_id` em `messages[]`.
- **Status.** `statusId = String(stage)`; `category` vem da categoria do stage. Se o stage for nulo OU contradisser
  `status` (o backend reabre sem trocar o stage: o ticket reaberto continua com o stage "Fechado"), usa o stage de
  fábrica da categoria `status`, que é a que o servidor usa em filtros e contadores. Não use ids literais ('solved',
  'new'): `statusIdByCategory()` em `lib/status.ts`.
- **Corpo das mensagens e macros: markdown no backend, HTML só nas bordas.** `markdownToHtml` (marked + o
  `sanitizeHtml` da conversa, agora em `lib/sanitizeHtml.ts`) escapa HTML cru (o backend também o mostra como texto),
  resolve `@[user:12]` pelo nome da menção, e só deixa `a/ul/ol/strong/em...` com `href` http/https/mailto/tel. A
  assinatura (`signature_html`, já higienizada) é anexada à mensagem pública. O caminho inverso (Tiptap HTML
  para markdown, etapa 3) é `htmlToMarkdown`.
- **SLA.** Um `TicketSla`: o relógio pendente mais urgente (estourado, depois o de menor prazo), senão o último
  cumprido; `at_risk` vira `warning`; sem prazos, `undefined`. O nome ("Primeira resposta"/"Resolução") é sintético.
- **Eventos.** Só `TicketStatusEvent`: viram `field_change` ("Status: Novo para Aberto"); reabertura/automático ficam
  como evento do sistema. Os `kind` `sla`, `notification`, `ai_triage` não existem no backend.
- **`useSession.teams` x grupos.** `me.teams` traz SLUGS; `Group.slug` guarda o slug e `useMyGroups()`
  (`store/useMyGroups.ts`) casa os dois (no mock, `teams` já são ids de grupo).
- **Busca.** Prévia = `/search/` (mín. 2 caracteres, até 8 por grupo); página completa = `/tickets/?q=` + diretório de
  clientes/empresas no navegador. Operadores (`status:`, `priority:`, `assignee:`) e `#id` não existem no backend e
  rodam no navegador sobre os tickets carregados.
- **Gatilhos de exemplo.** Continuam locais, mas os ids do mock (`pending`, `g2`...) são traduzidos para os reais na
  leitura (status pela categoria; grupo pela posição), para o motor local nunca gravar um id inexistente.

### Ainda local por natureza (mesmo na leitura)

Campos que o backend não tem aparecem vazios/padrão e ficam marcados em `capabilities`: tipo do ticket (`Tipo: -`),
CC e seguidores arbitrários, resumo/tópico/sentimento de IA, tags de usuário e de organização (sempre vazias),
grupo padrão e "acesso dos usuários" da organização (padrão `own_tickets`), `endUserName`/descrição de status
(= nome/vazio), macro: `availableTo` (todos), `usage7d` (0), ações de status e nota interna, e licenças (`total` fixo
em 5, `used` = agentes ativos reais). Datas de criação/atualização do usuário não existem no Resolv (a tela mostra "-");
canal "e-mail" não existe (tudo vira "Formulário web"; `chat` e `system` têm ícone próprio nas mensagens).

### Problemas do backend encontrados na leitura (não bloqueiam; sem mudar o backend)

1. Reabertura não restaura o stage: TD-00005 está com `status=open` e `stage_name="Fechado"` (o front usa a categoria).
2. `GET /ticket-views/` devolve array puro (sem envelope), diferente do resto.
3. Lista de tickets sem `requester_id`/`company_id`; mensagens sem `author_id`.
4. `settings/users` não expõe `created_at`/`updated_at`.

## Sem equivalente no backend (permanecem locais)

| Chave | O que é | Comportamento local | Observação para o backend |
| --- | --- | --- | --- |
| `triggers` | Gatilhos editáveis e motor de regras | Motor `lib/triggers.ts` roda no navegador; `fired7d` conta em memória | Backend só tem automações fixas (Celery). Não há e-mail/ação real. |
| `customFields` | Campos personalizados de ticket | CRUD em memória | Só existe `order_number` livre. |
| `forms` | Formulários de ticket (`formId`) | Fixo `'default'` | Não existe. |
| `aiSummary` | Resumo, tópico e sentimento de IA | Campos locais | Não existe. |
| `merge` | Fusão de tickets, usuários e organizações | Executa no estado local | Não existe fusão. |
| `deleteTicket` | Apagar ticket | Remove do estado local | Política "nada é hard-deleted"; usuário e empresa só desativam. |
| `ticketType` | Tipo (pergunta, incidente, problema, tarefa) | Campo local | Mais próximo: `category`/serviço. |
| `ccFollowers` | CC e seguidores arbitrários | Listas locais | Só o próprio usuário segue/deixa de seguir. |
| `licenses` | Licenças de agente (`AGENT_SEATS`) | Valor fixo | Cotas são por empresa cliente. |

Também locais por natureza: abas abertas (`tickets/tabs` existe, etapa 5), itens recentes e a simulação de
chegada de tickets (`startLiveUpdates`, desligada no modo real; virá do WebSocket `/ws/me/`). O motor de gatilhos está
DESLIGADO no modo real (ver "Decisões das escritas").

## Pedidos opcionais ao backend (etapa 8, não bloqueiam)

`author_id` em `messages[]`; `requester_id` e `company_id` na lista de tickets; `updated_since`; status direto no
`PATCH`; tags livres para agentes.

## Camada local no modo real (só para o que o backend não tem)

`real/local.ts` mantém, em memória e só nesta sessão: `Layer` (fusão/apagar de tickets, usuários e organizações),
`ticketPatches` (campos de ticket sem equivalente), `statusExtras`, `macroExtras`, `userExtras`, `orgExtras` e os ids
"apagados" (o backend só desativa). Tudo é reaplicado por cima de cada leitura real e descartado ao recarregar; nada
disso é enviado ao servidor.
