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
| `tickets` | real (leitura) | `GET /tickets/` (só a 1ª página, `HOME_PAGE`=100, no boot; o resto vem por visão), `GET /tickets/{id}/` (detalhe sob demanda, também quando o ticket não está na lista) e `GET /tickets/?requester=`/`?company=` (histórico do cliente e da organização, até 500). A lista traz `requester_id`/`company_id` e as mensagens `author_id`: nada é casado por nome. |
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
| Criar ticket | **1 chamada**: `POST /tickets/` (multipart se houver anexos: equipe, assunto, corpo em markdown, prioridade, solicitante, `assignee`, `stage`, `tags` por id, `is_public:false` para observação interna). Só o que o POST não cobre vai depois: `follow`, `apply-macro` e, se nasce fechado, `close/` |
| Responder (público) | `POST /tickets/{id}/reply/` com `new_status` derivado do status escolhido (`open`, `pending_customer`, `closed`; "Novo" vira `open`), markdown e anexos em multipart |
| Observação interna / chamada | `reply` com `is_public:false` (não muda status) |
| Mudar status | com resposta pública: um `reply` com `new_status` + `stage` (personalizado ou de fábrica; só "Novo" precisa de `bulk-status` depois); sem texto ou com nota interna: `bulk-status` (novo/aberto/pendente) ou `close/` (resolvido) |
| Fechar | `close/` ou `reply` com `new_status:closed`, sempre com a janela da solução (abaixo) e `stage` do status escolhido (personalizado da categoria fechada ou de fábrica) |
| Atribuir / aceitar, prioridade, grupo, etiquetas | um `PATCH /tickets/{id}/` (`assignee`, `priority`, `team`, `tags` por id) |
| Seguir / deixar de seguir | `follow/` e `unfollow/` (só o próprio usuário) |
| Macro | `apply-macro` no envio (soma categoria/prioridade/responsável/etiquetas e registra o evento); o texto é inserido no compositor com `{{solicitante}}`, `{{empresa}}`, `{{referencia}}` preenchidos |
| Ações em lote | `bulk-assign`, `bulk-priority`, `bulk-status`, todos com `report_missing:true`; "resolvido" = `bulk-close` com `items:[{id, resolution_started_at, resolution_ended_at}]` depois do diálogo de confirmação (um `close/` por ticket só para status personalizado fechado); falhas por ticket em `failed[]`, mostradas no diálogo |
| Admin: status | `POST/PATCH /settings/statuses/` (nome, cor hex, categoria na criação, `is_active`); os 400 (nome repetido, categoria com tickets, status de fábrica) aparecem no campo certo do formulário |
| Admin: macros | `POST/PATCH/DELETE /settings/ticket-macros/` (corpo markdown, prioridade, etiquetas por id, ativo); só para quem tem `macro.manage` ou `settings.manage` em `me.permissions` |
| Admin: membros | `POST /settings/teams/{id}/agents/` (com grupo) ou `POST /settings/users/` (interno); o backend envia o convite. Suspender = `is_active:false` |
| Organizações | `POST/PATCH/DELETE /settings/companies/` (slug derivado do nome, plano escolhido no modal; apagar = desativar, some da lista) |
| Clientes | `POST/PATCH/DELETE /settings/users/` (exige organização e telefone, pedidos no modal; apagar = desativar) |
| Etiquetas | criadas por `POST /settings/tags/` quando o ticket/macro usa um nome novo (só administrador; agente é avisado antes de qualquer escrita) |

Ainda LOCAIS no modo real (em memória, somem ao recarregar; marcados "somente neste navegador"): assunto, solicitante e
os campos de IA do painel (camada `layers.ticketPatches`); nome do status para o usuário final e descrição;
descrição, "disponível para", ação de status e nota interna da macro; tags, grupo padrão e "acesso dos usuários" da
organização; tags, notas, contatos extras, idioma e fuso do cliente; fundir ticket, usuário e organização; gatilhos.
**Campos personalizados e formulários agora vão ao backend** (seção própria, abaixo). Visões pessoais (criar/editar/apagar) vão ao backend (`/ticket-views/`); abas abertas e itens
recentes seguem locais. **Tipo, apagar/restaurar, CC e seguidores de terceiros, licenças e resumo de IA agora vão ao
backend** (seção "Tipo, apagar, CC e seguidores, licenças e resumo de IA", abaixo).

### Decisões das escritas (etapas 3 e 4)

- **Sem transação entre chamadas.** `planTicketUpdate` (`real/mappers/outbound.ts`, pura e testada) monta os passos na
  ORDEM SEGURA: macro, propriedades (idempotentes e validadas cedo), seguir, mensagem (a única que duplica se repetida),
  status por coluna (`bulk-status`, só quando não há resposta pública nem fechamento: o `reply` e o `close/` já levam o `stage`). Falha no meio vira `PartialUpdateError`: "Aplicado: prioridade, etiquetas. Não aplicado:
  mensagem. Motivo: ...". O formulário mantém o texto ainda não gravado, trata o que valeu como aplicado (`original`) e o
  "Tentar novamente" refaz o plano contra o estado do servidor, mandando SÓ o que falta (mensagem já gravada não volta;
  ticket criado a meio vira a aba do ticket real e a repetição atualiza, nunca cria outro). Resposta perdida (rede/5xx)
  na mensagem: confere o ticket antes de permitir repetir. Toast de sucesso: "Ticket #N foi atualizado".
- **Fechar (D4).** O backend exige `resolution_started_at`/`resolution_ended_at` (criação <= início <= fim <= agora, no
  minuto) e soma a janela na franquia de horas de manutenção da empresa. Pela tela do ticket o Helpdesk abre o diálogo
  `CloseResolutionModal` (início/término editáveis, pré-preenchidos com a sugestão D4 que o próprio backend documenta:
  início = primeira transição para "Aberto" do ciclo atual, senão a criação; fim = agora no minuto). O status escolhido
  vai em `stage` (`close/` e `reply` com `new_status:closed`); sem `stage` o backend usa o "Fechado" de fábrica.
  **Em lote** ("Mudar status" > status resolvido, ou "Marcar como resolvido" numa linha) abre `BulkCloseModal` (também no
  mock): quantidade, política (cada ticket usa a sua janela sugerida), início e fim de cada ticket e um término comum
  editável (validado por ticket com as mesmas regras do backend). Confirmando, um `POST /tickets/bulk-close/` com
  `items:[{id, resolution_started_at, resolution_ended_at}]`; falhas por ticket (`failed[]`, inclusive id inexistente via
  `report_missing:true`) ficam no diálogo com o motivo de cada uma e "Tentar novamente" reenvia só elas. Tickets já
  fechados ficam fora do lote (o diálogo avisa). O `bulk-close` não tem `stage`: para um status personalizado fechado o
  lote faz um `close/` com `stage` por ticket. Se o relógio do navegador estiver adiantado em mais de 1 min o backend
  responde "Término no futuro" e a mensagem aparece.
- **Reabrir** só por resposta pública: mudar de "resolvido" para outro status sem mensagem é recusado ANTES de qualquer
  chamada, com a explicação. Responder publicamente num ticket fechado reabre (`new_status:open`); o backend troca a
  coluna para o "Aberto" de fábrica ou para o `stage` escolhido (o front envia `stage` quando o usuário escolheu um status).
- **Criar ticket triado.** `POST /tickets/` recebe `assignee`, `stage` (status por coluna, inclusive personalizado; o
  "Novo" de fábrica não é enviado), `tags` (ids; multipart repete o campo) e `is_public:false` (a descrição vira
  observação interna, que o cliente nunca vê). O backend confere tudo antes de gravar: recusa = 400 e NENHUM ticket
  criado. Status de categoria fechada não vai no POST (pede as datas da solução): o ticket nasce e um `close/` com a
  janela e o `stage` vem em seguida. Sem a permissão `ticket.edit_properties` o front não auto-atribui o criador.
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
  que foi digitado). `settings.manage` ausente: criar etiqueta é recusado sem chamar o backend. `me.permissions` fica na
  sessão (`lib/permissions.ts`): sem `macro.manage` nem `settings.manage` o agente não vê criar/editar/excluir macro
  (a lista e a tela da macro ficam só para leitura); sem `ticket.add_internal_note` a criação como observação interna é
  recusada antes de chamar o backend.
- **Admin de status: erros do backend no formulário.** 400 `name` (nome repetido), `category` (troca com tickets em uso) e
  `is_active` (status de fábrica) aparecem no campo certo ou em faixa, sem perder o digitado. A UI já avisa antes: status de
  fábrica mostra "De fábrica", "Desativar" fica desabilitado e a categoria trava com a explicação; status personalizado em
  uso (`ticket_count` > 0) trava a categoria com a contagem.
- **Limite de login (429).** `toApiError` lê `Retry-After` (segundos ou data) e `retry_after` do corpo; a tela de login mostra o
  `detail` do backend, a espera com contagem regressiva e mantém o botão desabilitado até o fim.
- **Contadores** do servidor são recarregados depois de cada escrita; a store não perde mensagens já carregadas quando a
  lista enxuta volta (`keepDetails`).

### Problemas do backend nas escritas

Corrigidos no backend e **RESOLVIDOS** (verificados no Helpdesk contra o backend novo, porta 8001, dados do seed):

1. ~~`POST /tickets/` só aceitava poucos campos e o corpo era sempre público~~ RESOLVIDO: `assignee`, `stage`, `tags`, `is_public`; criar interno e público verificados (1 chamada; mensagem interna `is_public:false`, histórico "atribuído a ...").
2. ~~`bulk-close` com janela única; `bulk-priority` ignorava ids~~ RESOLVIDO: `items` por ticket e `report_missing` (verificado: `bulk-close` com 3 janelas diferentes; falha de um ticket já fechado em `failed[]`; id 99999 em `failed[]` com `report_missing`).
3. ~~`PATCH` desativava status de fábrica; categoria/nome repetido~~ RESOLVIDO: 400 `is_active` / `category` / `name` (verificados por curl e no formulário).
4. ~~`me.permissions` do agente incluía `macro.manage` sem poder escrever~~ RESOLVIDO: o agente de dev não a tem e o front esconde criar/editar macro.
5. ~~Fechar sempre caía no "Fechado" de fábrica~~ RESOLVIDO: `stage` em `close/` e `reply` (verificado com status personalizado fechado, com e sem mensagem).
6. ~~Limite de login 429 sem `Retry-After`~~ RESOLVIDO no backend (cabeçalho, `retry_after` e `detail` em pt-BR, `CORS_EXPOSE_HEADERS`); a tela foi testada com resposta simulada (sem esgotar o login real).

Continuam (sem mudar o backend):

7. `POST /settings/companies/` exige `slug` (o front precisa derivar) e `plan`; cliente exige `company` e telefone. O convite é enviado na criação (sem `invite_status` além de pendente/aceito).
8. `bulk-close` não aceita `stage`: fechar em lote num status personalizado da categoria fechada exige um `close/` por ticket.
9. `GET /tickets/` não tem filtro por lista de ids: depois de uma ação em lote o front relê os tickets alterados um a um.
10. `GET /settings/teams/roster/` inclui equipes desativadas (o front as ignora ao escolher a equipe do ticket novo; antes escolhia a primeira da lista e o backend recusava com "Pk inválido").

### Decisões da leitura real (etapa 2)

- **Paginação por visão (substitui o "carregar tudo").** No boot a store carrega SÓ a 1ª página global (`HOME_PAGE`=100;
  `loadInfo.truncated` se houver mais). Home, painel do cliente, Clientes/Organizações e tags sugeridas leem a store, logo
  ficam incompletos com mais de 100 tickets (a Home busca a visão `mine` e a tela do ticket busca por id para mitigar;
  o resto é pendência). Visões com `query` buscam página a página (`VIEW_PAGE`=100, "Carregar mais"); `recent` e
  `solved-recent` seguem locais sobre o que estiver carregado. Contadores vêm do servidor. O que o
  servidor sabe contar exato (`meus-nao-resolvidos`, `nao-atribuidos`, `nao-resolvidos`, "pendentes") vem dele, e as
  demais ("atualizados recentemente", "resolvidos recentemente": o backend não filtra por `updated_at`, o `periodo` é
  por abertura) são contadas localmente. As visões do sistema sem par (`todos`, `sem-atendimento`, `aguardando-voce`,
  `mencionam-voce`, `resolvidos`, `internos`, `em-kanban`) e as pessoais têm `View.query` e a lista vem do servidor
  (`runView`) só ao abrir a visão. Tempo real: `/ws/me/` só avisa (`ticket_event` com `kind` assigned/owner/updated/closed/reply) quem é solicitante, responsável, dono ou seguidor; não há evento de ticket novo nem reenvio de eventos perdidos.
- **Custo medido (backend novo, 161 tickets, 1 cliente homônimo da Ana na mesma empresa).** Home = 12 chamadas (10 sem
  as 2 de `/auth/me/` do StrictMode), **0 de detalhe**; antes eram 47 (35 `GET /tickets/{id}/` só para descobrir o
  solicitante dos homônimos). Tela do ticket recarregada (F5) = 13 chamadas, 2 de detalhe do próprio ticket (uma é a
  corrida entre a lista e o detalhe); antes 42 (31 de detalhe). Sem homônimos o casamento por nome já não custava
  chamadas (Home 12, ticket 13), por isso o ganho aparece com homônimos e tickets restritos. Abrir uma visão do
  servidor = 1 `GET /tickets/?view=`; histórico do cliente = 1 `GET /tickets/?requester=` por 100 tickets.
- **Solicitante, empresa e autor (ids do backend).** A lista traz `requester_id` e `company_id` (nulos só em ticket
  restrito: `requesterId = ''` e o nome mascarado aparece) e cada mensagem traz `author_id` (nulo em mensagem do sistema
  ou autor que o usuário não pode ver: vira `system` ou `name:<nome>`, que nunca colide com um id real). Nenhum casamento
  por nome e nenhum detalhe só para achar o solicitante. Os eventos do ticket ainda trazem só `actor_name` (casado por nome).
- **Status.** `statusId = String(stage)`; `category` vem da categoria do stage. O backend novo troca a coluna ao reabrir
  (TD-00005 agora está no "Aberto"); por defesa, se o stage for nulo OU contradisser `status` (dado antigo), usa o stage
  de fábrica da categoria `status`, que é a que o servidor usa em filtros e contadores. Não use ids literais ('solved',
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

Campos que o backend não tem aparecem vazios/padrão e ficam marcados em `capabilities`: resumo/tópico/sentimento/idioma
de IA (campos de IA do painel, locais), tags de usuário e de organização (sempre vazias), grupo padrão e "acesso dos usuários" da
organização (padrão `own_tickets`), `endUserName`/descrição de status (= nome/vazio), macro: `availableTo` (todos),
`usage7d` (0), ações de status e nota interna. Criação/atualização do usuário vêm de `created_at`/`updated_at` (backend antigo sem eles: a tela mostra "-");
canal "e-mail" não existe (tudo vira "Formulário web"; `chat` e `system` têm ícone próprio nas mensagens).

### Problemas do backend encontrados na leitura

Os quatro (reabertura sem trocar o stage, `/ticket-views/` sem envelope, lista sem `requester_id`/`company_id` e mensagens
sem `author_id`, usuário sem `created_at`/`updated_at`) foram corrigidos no backend e estão **RESOLVIDOS**, verificados
contra o backend novo: TD-00005 reaberto no "Aberto"; `?page=`/`?limit=` devolvem o envelope (o Helpdesk segue usando o
array puro, que traz todas as visões); ids e carimbos nas respostas. Ver as "Escritas" acima para o que continua.

## Sem equivalente no backend (permanecem locais)

| Chave | O que é | Comportamento local | Observação para o backend |
| --- | --- | --- | --- |
| `triggers` | Gatilhos editáveis e motor de regras | Motor `lib/triggers.ts` roda no navegador; `fired7d` conta em memória | Backend só tem automações fixas (Celery). Não há e-mail/ação real. |
| (campos de IA) | Resumo, tópico, sentimento, idioma e confianças do painel "Campos de IA" | Em memória, por ticket (`Ticket.customFields`; no real, `ticketPatches`) | Não são campos personalizados do backend (que nunca tem campo de fábrica). Aparecem em Admin > Campos como "Campo padrão" + "Somente neste navegador". |
| `merge` | Fusão de tickets, usuários e organizações | Executa no estado local | Não existe fusão. |

Também locais por natureza: abas abertas (`tickets/tabs` existe, etapa 5), itens recentes e a simulação de
chegada de tickets no mock; no real, WebSocket `/ws/me/` (`api/real/ws.ts`). O motor de gatilhos está
DESLIGADO no modo real (ver "Decisões das escritas").

## Tipo, apagar, CC e seguidores, licenças e resumo de IA (RESOLVIDOS no backend, ligados no front)

`capabilities`: `ticketType`, `deleteTicket`, `ccFollowers`, `licenses` e `aiSummary` agora são `'real'` (no mock seguem
`'local'` e o mock imita o contrato). Verificados no navegador contra o backend novo (porta 8021, banco de dev, só dados
`AG-front`). Contrato: `resolv/docs/ALTERACOES-HELPDESK.md` e `resolv-openapi.yaml`.

| Recurso | Chamadas | O que o front faz |
| --- | --- | --- |
| Tipo | `type` (`question`/`incident`/`problem`/`task`, nulo) na lista, no detalhe, em `POST /tickets/` e `PATCH` (`null` limpa); filtro `?type=` | Campo "Tipo" do painel vai no `PATCH` (junto das outras propriedades) e na criação. Eventos de auditoria `tipo → X` (o backend manda `note` com status de = para) viram texto sem "De/Para". O filtro de tipo da gaveta vai ao servidor nas visões avaliadas lá (`?view=...&type=...`, recarrega a lista; `viewType` na store). |
| Apagar / restaurar | `DELETE /tickets/{id}/` (204), `POST /tickets/{id}/restore/` | Menu ⋮, ação da linha e lote só para quem tem `settings.manage`. Confirmação forte mantida (texto explica o efeito, 30 dias, horas lançadas; foco em Cancelar). Só sai da tela o que o servidor confirmou: 403/404/409 `ticket_conflict` viram frases claras em toast e o ticket continua. Ao apagar: fecha a aba, tira da store e navega. O admin que abre o ticket apagado vê o banner "Apagado em… por…" com Restaurar (somente leitura enquanto apagado); deletado nunca entra em lista nem contador. |
| CC e seguidores | `GET/POST/DELETE /tickets/{id}/cc/` e `/followers/`; `cc` e `followers` no detalhe | Ticket existente: grava na hora (campo CC do compositor com chips e contador "n de 20"; "Seguidores" do painel), erro 400 no próprio campo (e-mail inválido, é o do solicitante, mais de 20, cliente de outra empresa). Ticket novo: fica no formulário e vai em chamadas logo depois da criação (`planNewTicket`/`planTicketUpdate`: `cc_add`, `follower_add`...). Seguidor pode ser equipe ou cliente da mesma empresa. |
| Licenças | `GET/PATCH /settings/licenses/` (`{total,used,available,unlimited}`) | Membros (cartão com "N de total", vagas livres, "Editar total" só para admin: número ou "Sem limite"; 400 `seat_total_below_used` no campo) e Início do admin (barra, ou "N (sem limite)" sem barra). 409 `seat_limit_reached` ao criar/reativar membro aparece no modal (criar, sem perder o digitado) ou em toast (reativar). O teto local de 5 assentos foi removido do real (no mock o total inicial é 5 e editável). |
| Resumo de IA | `POST /tickets/{id}/ai-summary/` | Botão "Gerar resumo" na conversa (só gera ao clicar). Aviso fixo "Dados pessoais são mascarados antes do envio", "Resumo truncado" quando `truncated`. 503 `ai_not_configured` = aviso informativo "O resumo por IA não está configurado nesta conta."; 502, 429 (com a espera) e 403 com frases próprias. Resultado só em memória (`useAiSummary`), nada em storage. No mock o resumo é simulado e rotulado. |

Ressalvas e decisões:

- Resumo, tópico, sentimento e idioma do painel "Campos de IA" continuam sendo **campos personalizados locais** (aviso mantido): o resumo do servidor não é gravado e não preenche esses campos.
- Apagar usa `settings.manage` (não há `ticket.delete`); quem não a tem não vê "Apagar" nem "Marcar como spam" (spam também apaga). Ticket com horas lançadas: 409, mantido.
- A mensagem 409 de licenças do backend cita "Configurações > Licenças", que no Helpdesk é "Membros da equipe" (texto do servidor, mostrado como veio).
- `type` não é aceito como filtro de visão pessoal (`VALIDADORES` do backend não o lista): a gaveta aplica o tipo no servidor só ao listar, e não o grava na visão.
- `GET /tickets/{id}/` de ticket apagado devolve 200 ao admin: os eventos `ticket_event` do WebSocket que chegam depois de apagar o fazem ser ignorado na lista (`applyServerTicket`).
- Mock: `deleteTickets` move para uma lixeira (restaurável), `cc`/seguidores gravam como o servidor (limite de 20, e-mail do solicitante recusado), licenças limitam criação e reativação com 409, o resumo é simulado.

## Campos personalizados e formulários de ticket (RESOLVIDOS no backend, ligados no front)

`capabilities`: `customFields` e `forms` são `'real'` no modo real (no mock seguem `'local'` e o mock imita as mesmas regras).
Contrato: `resolv/docs/ALTERACOES-HELPDESK.md` (seção "Campos personalizados e formulários de ticket"). Só equipe: o
cliente nunca vê nem edita (o Helpdesk não tem portal de cliente e nada voltado ao cliente renderiza esses campos).
Verificado no navegador contra o backend novo (porta 8031, só dados `AG-front`).

| Recurso | Chamadas | O que o front faz |
| --- | --- | --- |
| Campos (Admin > Campos) | `GET/POST/PATCH/DELETE /settings/ticket-fields/`, `POST .../reorder/` | Tipos v1: texto, parágrafo, número, data, caixa de seleção, lista suspensa. Criar/editar título, descrição, obrigatório e opções; ativar/desativar; mover para cima/baixo (reorder). Editor de opções com ordem e valores únicos (renomear opção salva mantém o `value` guardado nos tickets). `type` trava no editor quando o campo já tem valores (`values_count`). 409 `field_in_use` ao apagar: diálogo "Este campo já foi usado" que oferece **desativar**. 400 no campo certo (`title`, `type`, `options`...), o resto em faixa, sempre mantendo o digitado; 403 = "Você não tem permissão para esta ação.". Os campos padrão do front (assunto, descrição, solicitante, atribuído, grupo, status, prioridade, tipo, tags) e os campos de IA aparecem como "Campo padrão", sem ações. |
| Formulários (Admin > Formulários) | `GET/POST/PATCH/DELETE /settings/ticket-forms/`, `POST .../reorder/`, `POST .../{id}/clone/` | Nome, descrição, ativo, campos com ordem e obrigatório por formulário (`form_fields`), equipe padrão e tipo padrão, "Definir como padrão" (troca o padrão), clonar, mover. 409 `default_form_required` (tirar, desativar ou apagar o padrão) e `form_in_use` (apagar formulário com tickets: sugere desativar) viram a frase do servidor e/ou diálogo. |
| Valores no ticket | `custom_fields` e `form_id` em `PATCH /tickets/{id}/` e `POST /tickets/`; `form_id` na lista e no detalhe; `custom_fields` só no detalhe | O painel "Campos do formulário" mostra o seletor de formulário (só com mais de um ativo) e os campos do formulário do ticket (ou do padrão) na ordem, com o controle do tipo e asterisco nos obrigatórios. Salvar vai no MESMO `PATCH` das outras propriedades (passo `props` do plano: antes de `follow`, mensagem e fechamento; só o que mudou, `null` apaga), então a ordem de chamadas e a falha parcial existentes continuam valendo. Campo desativado some, ou aparece só para leitura se o ticket tem valor. 400 `{custom_fields:{slug:msg}}` aparece no campo certo. |
| Ticket novo | `form_id` + `custom_fields` no `POST /tickets/` | Formulário padrão pré-selecionado; escolher outro aplica equipe e tipo padrão dele (só enquanto o agente não escolheu outros); obrigatórios validados no cliente antes de enviar (erro por campo); no multipart o `custom_fields` vai como JSON em texto. 400 `required_custom_fields` do servidor: erro em cada campo, ticket não criado. |
| Resolver/fechar | 400 `required_custom_fields` em `close/` e `reply` (`new_status:closed`); `failed[]` do `bulk-close` | O cliente antecipa (diálogo "Faltam campos obrigatórios", com "Enviar assim mesmo": o servidor decide). Recusa do servidor: o mesmo diálogo em modo "não foi resolvido", com "Ir ao campo" (foca o controle no painel) e o texto da resposta intacto (o backend não grava a resposta nem fecha). Em lote, o item de `failed[]` mostra "Campos obrigatórios pendentes: A, B" (nomes lidos do `detail`, que é só texto) e "Abrir ticket para preencher". |

Ressalvas e decisões:

- `custom_fields` **não vem na lista**, só no detalhe (`Ticket.fieldValues` fica `undefined` na lista). Por isso **não há coluna nem filtro por campo personalizado** nas listas/visões: não existia no Helpdesk. O backend já aceita `?cf_<slug>=valor` (igualdade; dropdown pelo `value`, checkbox `true|false`, date `AAAA-MM-DD`; ignorado para slug desconhecido) e é o caminho se um filtro for criado: o front **não o usa hoje**.
- Isenções de obrigatoriedade no backend: ticket criado pelo cliente (portal), cliente encerrando o próprio ticket, fechamento automático por falta de resposta, importação e conversão de chat não validam obrigatórios. O front só exige ao criar e ao resolver/fechar pelo agente; mudar status para resolvido sem passar por `close/` não existe no Helpdesk.
- Campo obrigatório que não está no formulário do ticket não é exigido (o front calcula igual: ativo, no formulário, obrigatório no campo OU no formulário). Checkbox `false` conta como preenchido; `0` também. Por isso o checkbox do painel tem "Limpar" (voltar a sem valor).
- O `detail` do `failed[]` do `bulk-close` não traz a lista estruturada de campos (só texto): os nomes são extraídos do texto depois dos dois-pontos. O `POST close/` e o `reply` trazem `fields[]` estruturado.
- Retirar uma opção em uso é permitido: o ticket mantém o valor e o painel o mostra como "valor (removida)".
- Limite de 60 campos ativos (400 ao criar/reativar além disso; faixa no modal). O teto local de 20 da visão geral do admin foi trocado por esse limite.
- O mock aplica as mesmas regras (obrigatório ao criar e ao resolver, 409 de campo em uso, formulário padrão único, não apagar formulário com tickets, equipe/tipo do formulário só se o envio não trouxe os seus) e traz dados de exemplo (7 campos, 3 formulários; incidentes usam o formulário "Incidentes" com contrato e severidade obrigatórios).
- Quem não tem `settings.manage` lê campos e formulários (qualquer agente), mas leva 403 ao escrever (mensagem padrão); os botões continuam visíveis no Admin, que já é área de administrador. Agente sem `ticket.edit_properties` leva 400 ao gravar `custom_fields` (a mensagem do servidor aparece no banner).
- Eventos de auditoria `campo: Título: antes → depois` e `formulário → Nome` chegam como `note` com status de = para e aparecem como texto no histórico, como os de tipo.

## Pedidos opcionais ao backend (etapa 8, não bloqueiam)

`updated_since`; status direto no `PATCH`; tags livres para agentes; `actor_id` nos eventos; `stage` no `bulk-close`;
filtro por lista de ids em `GET /tickets/`; `fields[]` estruturado (e não só texto) no `failed[]` do `bulk-close` quando o motivo é `required_custom_fields`; `custom_fields` opcional na lista. (`author_id`, `requester_id` e `company_id` já foram entregues.)

## Camada local no modo real (só para o que o backend não tem)

`real/local.ts` mantém, em memória e só nesta sessão: `Layer` (fusão/apagar de tickets, usuários e organizações),
`ticketPatches` (campos de ticket sem equivalente), `statusExtras`, `macroExtras`, `userExtras`, `orgExtras` e os ids
"apagados" (o backend só desativa). Tudo é reaplicado por cima de cada leitura real e descartado ao recarregar; nada
disso é enviado ao servidor.
