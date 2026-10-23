# Alterações de API para o front Helpdesk

Referência para adaptar o front Helpdesk (`/helpdesk`) ao backend. Tudo é **aditivo e
retrocompatível**: quem não enviar os campos/parâmetros novos recebe o comportamento de
sempre, e o front próprio do Resolv (`resolv/frontend`) segue funcionando sem mudança.
O contrato completo está em `resolv-openapi.yaml` (regenerado com
`python manage.py spectacular --file resolv-openapi.yaml`; no Docker: `make schema`).

Base: `/api/v1`. Autenticação por sessão + cabeçalho `X-CSRFToken`, como antes.

| # | Mudança | Endpoint | Compatibilidade |
|---|---------|----------|-----------------|
| 1 | Senha temporária sempre válida | `POST /settings/users/{id}/reset-password/` | resposta igual |
| 2 | 429 com `Retry-After` e mensagem | `POST /auth/login/` (e qualquer throttle) | limite inalterado |
| 3 | Criar ticket já triado | `POST /tickets/` | campos novos opcionais |
| 4 | Lote: janela por ticket, ausentes em `failed[]` | `POST /tickets/bulk-*` | opt-in |
| 5 | Regras de edição dos status | `/settings/statuses/` | só recusa o que era erro |
| 6 | Fechar em status personalizado | `close/`, `reply` | campo `stage` opcional |
| 7 | Reabrir muda a coluna | `reply`, resposta do cliente | correção + migração |
| 8 | `macro.manage` coerente | `me.permissions`, `/settings/ticket-macros/` | ver abaixo |
| 9 | Ids e carimbos nas respostas | tickets, mensagens, usuários, `/ticket-views/` | campos novos |

---

## 1. Senha de redefinição aleatória

`POST /settings/users/{id}/reset-password/` (admin). Antes a senha vinha de
`secrets.token_urlsafe`, que às vezes não tinha três tipos de caractere; o validador do
projeto a recusava e a segunda tentativa estourava 500. Agora a senha **nasce** com
minúscula, maiúscula, dígito e símbolo (16 caracteres, sem `0/O/1/l/I`), sorteada com
`secrets`, e é validada em laço limitado (10 tentativas). Se ainda assim falhar, devolve
**400** (`{"detail": [...]}`), nunca 500.

```http
POST /api/v1/settings/users/10/reset-password/
200 {"password": "k7#Qm2xR-vNp4Wz!"}
```

Compatível: o formato da resposta não mudou. Código: `apps/accounts/validators.py`
(`gerar_senha_temporaria`).

## 2. Limite de login (429)

O limite continua **20/hora por IP** (`login`). A resposta 429 do throttle agora traz
cabeçalho `Retry-After` (segundos) e uma mensagem pt-BR com a espera:

```http
429 Too Many Requests
Retry-After: 3541

{"detail": "Muitas tentativas em pouco tempo. Aguarde 1 hora e tente de novo.",
 "code": "throttled", "retry_after": 3541}
```

* `detail` continua sendo a chave que o front exibe; `code` e `retry_after` são novos.
* A espera é arredondada para cima (segundos, minutos ou horas).
* `CORS_EXPOSE_HEADERS = ["Retry-After"]`: um front em outra origem (Helpdesk em `:5173`)
  consegue ler o cabeçalho.
* O bloqueio por força bruta do `django-axes` (`code: "login_bloqueado"`) já enviava
  `Retry-After` e não mudou.

## 3. `POST /tickets/` já triado

Campos novos, **todos opcionais**, só para usuário interno (cliente que os envia leva 400):

| Campo | Tipo | Efeito |
|-------|------|--------|
| `assignee` | id de agente ativo (ou `null`) | responsável; mesmas regras de `assign` (quem recebe precisa poder ser responsável) |
| `status` | `new` \| `open` \| `pending_customer` | status inicial por categoria (`closed` é recusado: fechar pede as datas da solução) |
| `stage` | id de status | status inicial por coluna (inclui personalizados). Se vier com `status`, a categoria do stage tem de ser a mesma. Tem de estar ativo |
| `tags` | lista de ids de etiquetas existentes | etiquetas |
| `is_public` | bool (padrão `true`) | `false` = a primeira mensagem nasce como **nota interna** (o cliente nunca a vê, não leva assinatura) |

Exigências: papel com `ticket.edit_properties` para `assignee`/`status`/`stage`/`tags`;
`ticket.add_internal_note` para `is_public:false`. **Tudo é conferido antes de gravar:**
uma recusa (400) não deixa ticket criado pela metade. O responsável é avisado (in-app e
e-mail) depois do commit. O histórico registra "atribuído a X" e a mudança de status.
Multipart (anexos) aceita os mesmos campos (`tags` repetido, `is_public=false`).

```http
POST /api/v1/tickets/
{"team_id": 1, "subject": "Impressora parada", "body": "Nota para a equipe",
 "requester_id": 5, "priority": "high", "assignee": 3, "status": "open",
 "tags": [1, 2], "is_public": false}

201 {"id": 157, "reference": "TD-00157", "status": "open", "stage_name": "Aberto",
     "assignee_id": 3, "tags": [{"id": 1, ...}, {"id": 2, ...}],
     "messages": [{"author_id": 1, "is_public": false, "body": "Nota para a equipe", ...}], ...}
```

Sem os campos novos: `status:"new"`, sem responsável, sem etiquetas, mensagem pública (igual a antes).
Erros: `{"status": ["\"closed\" não é uma escolha válida."]}`, `{"tags": ["Pk inválido ..."]}`,
`{"detail": "..."}` (regras de papel/stage).

## 4. Ações em lote

### `bulk-close`: janela por ticket

Dois formatos, exclusivos (enviar os dois = 400):

```http
# antigo (continua igual): uma janela para todos
POST /tickets/bulk-close/
{"ticket_ids": [1, 2], "resolution_started_at": "...", "resolution_ended_at": "...", "note": ""}

# novo: janela de cada ticket
POST /tickets/bulk-close/
{"items": [
  {"id": 157, "resolution_started_at": "2026-10-22T19:00:00Z", "resolution_ended_at": "2026-10-22T19:40:00Z"},
  {"id": 158, "resolution_started_at": "2026-10-01T10:00:00Z", "resolution_ended_at": "2026-10-22T19:40:00Z", "note": "ok"}
]}

200 {"updated": [157],
     "failed": [{"id": 158, "detail": "Início da solução anterior à criação do ticket."}]}
```

* No formato novo a janela/`note` de nível superior, se vier, é o **padrão** dos itens que
  não trouxerem a própria.
* Um ticket inválido (janela antes da criação, término no futuro, item sem janela, item
  mal formado, já fechado) vai para `failed[]` com o motivo; **o resto fecha**. No formato
  antigo isso já valia por ticket.
* Janela ausente no formato antigo continua 400.

### `report_missing` (opt-in, todos os `bulk-*`)

`bulk-assign`, `bulk-priority`, `bulk-close` e `bulk-status` aceitam `report_missing: true`.
Padrão `false` = o silêncio de antes (ids inexistentes ou fora do escopo do usuário somem
da resposta; o front do Resolv depende disso). Com `true`, cada um entra em `failed[]` com o
**mesmo** motivo para os dois casos, então nada vaza sobre a existência do ticket:

```http
POST /tickets/bulk-priority/  {"ticket_ids": [156, 99999], "priority": "high", "report_missing": true}
200 {"updated": [156], "failed": [{"id": 99999, "detail": "Ticket não encontrado."}]}
```

Os quatro tinham o mesmo defeito (silêncio), então os quatro ganharam o parâmetro.

## 5. `/settings/statuses/`

* `PATCH` com `is_active:false` em status **de fábrica** (`is_system`) → 400
  `{"is_active": ["Status de fábrica não pode ser desativado."]}` (alinhado ao `DELETE`).
  Mudar a categoria de status de fábrica já era recusado.
* **Nome repetido** (sem caixa, sem acento, espaços normalizados) entre os status ativos →
  400 `{"name": ["Já existe o status \"Aberto\". Escolha um nome diferente."]}`. Vale em
  criar, renomear e reativar. Status inativos não bloqueiam o nome; dado antigo repetido
  não impede editar a cor (só confere quando o nome muda ou o status é reativado).
* **Categoria de status personalizado**: livre enquanto nenhum ticket o usa; **com tickets é
  recusada** (400: "N chamado(s) usam este status...") porque deixaria cada um com `status`
  de uma categoria e coluna de outra. Decisão: recusar com a contagem em vez de mover os
  tickets em silêncio; o caminho é criar o status na categoria certa e mover os tickets
  (`bulk-status`), que registra o evento de cada um.

## 6. Fechar em status personalizado

`stage` (id, opcional) em `POST /tickets/{id}/close/` e em `POST /tickets/{id}/reply/`
(com `new_status:"closed"`). Tem de ser um status **ativo** da categoria `closed`; senão
400 (`"O status \"X\" não é da categoria fechado."` / `"... está inativo."`) e nada é gravado
(a resposta recusada não deixa mensagem). Sem `stage`: "Fechado" de fábrica, como antes.

```http
POST /tickets/161/close/
{"resolution_started_at": "...", "resolution_ended_at": "...", "stage": 12}
200 {"status": "closed", "stage": 12, "stage_name": "Resolvido", ...}
```

`stage` em `reply` só vale em resposta pública de agente com `new_status` (nota interna ou
cliente → 400).

## 7. Reabrir

Ao reabrir (resposta do cliente em ticket fechado, ou agente respondendo com
`new_status:"open"`), a coluna passa para o status de fábrica **ativo** da nova categoria
("Aberto"), ou para o `stage` escolhido em `reply` (ativo e da categoria de `new_status`).
`reply` com `stage` na **mesma** categoria atual só troca a coluna (sem evento de status).

Causa raiz do caso TD-00005: o código de produção já movia status e coluna juntos; o
descompasso vinha do **seed** (`seed_demo`, que mudava `status` sem a coluna). Corrigido o
seed e `stage_padrao()` (prefere o status de fábrica ativo).

Dados já inconsistentes (`status` diz uma categoria, `stage` outra):

* migração de dados `tickets/0030_reparar_stage_incoerente` (idempotente; reversível, a
  volta é um no-op porque o stage antigo era um erro);
* comando `python manage.py reparar_stages [--dry-run]` (mesma lógica, para rodar sob demanda).

Só a coluna muda; `status`, SLA e relatórios não.

## 8. `macro.manage`

Decisão: **alinhar a lista à regra** (docs e `GAPS.md`: macros "interno lê, admin escreve").
`macro.manage` saiu dos papéis agente e supervisor (o admin continua com todas). Além
disso, a permissão passou a valer de verdade: `/settings/ticket-macros/` aceita escrita de
quem tem `macro.manage` **ou** `settings.manage`, então um papel personalizado com
`macro.manage` consegue criar/editar macros sem virar administrador. `macro.use` (aplicar)
não mudou. Efeito para o front: `me.permissions` do agente deixa de conter `macro.manage`.

## 9. Ids, carimbos e paginação

**a) Lista de tickets** (`GET /tickets/`, também o detalhe): `requester_id` e `company_id`.
`requester_id` segue a máscara de `requester_display` (`null` em ticket restrito que o
usuário não pode ler); `company_id` acompanha `company_name`.

**b) Mensagens** (`messages[].author_id`): o id de quem escreveu; `null` em mensagem do
sistema. O agente recebe o id de qualquer autor. O **cliente** só recebe o de quem é cliente
(ele mesmo ou colega da empresa); o id de um agente fica `null` para ele (nome e avatar
seguem como antes).

**c) Usuários**: `created_at` e `updated_at` (somente leitura) em `/settings/users/` e
`/auth/me/`. O model já herdava `TimeStampedModel`; só não era exposto, então **não há
migração**. `updated_at` muda a cada `save()` completo (edição de cadastro) e não em
atualizações pontuais como `last_login`.

**d) `/ticket-views/`**: continua um **array puro** por padrão. Com `?page=`, `?limit=` ou
`?offset=` devolve o envelope e só calcula `count` (de tickets) das visões da página:

```http
GET /ticket-views/?page=2&limit=2
200 {"count": 5, "next": ".../ticket-views/?limit=2&page=3",
     "previous": ".../ticket-views/?limit=2&page=1", "results": [ ... ]}
```

`limit` padrão 25, teto 1000. `next`/`previous` usam `page` se a chamada usou `page`, e
`offset` caso contrário.

---

## Licenças de agente e resumo de ticket por IA

### Licenças (assentos de agente)

**Assento** = usuário **interno, ativo**, com papel `admin`, `supervisor` ou `agent`. Não contam
cliente, agente leve (`light_agent`), conta inativa/suspensa. Convite pendente conta (a vaga já é
dele). O total fica no singleton `SeatLicense` (migração `accounts/0015`); se estiver vazio vale o
padrão do ambiente `AGENT_SEAT_LIMIT`; vazio de novo = **sem limite** (`unlimited: true`).

```http
GET /settings/licenses/            (qualquer interno)
200 {"total": 5, "used": 3, "available": 2, "unlimited": false}

PATCH|PUT /settings/licenses/      (só admin)    {"total": 8}      # ou {"total": null} = sem limite
200 (mesmo formato)   400 {"detail": "...", "code": "seat_total_below_used"}  # total < used
```

Bloqueio (**409**, `{"detail": "O limite de licenças de agente foi atingido (5 de 5). ...",
"code": "seat_limit_reached"}`) em: `POST /settings/users/` (agente/supervisor/admin ativo),
`PATCH /settings/users/{id}/` que **reativa** (`is_active: true`) ou **promove** (cliente ou agente
leve para agente/supervisor/admin), `POST /settings/teams/{id}/agents/` ao criar agente novo e o
primeiro login Google de alguém novo (volta ao login com `?erro=licencas`). Editar quem já ocupa
assento, trocar entre papéis de assento, criar agente leve/cliente/conta já inativa e desativar
nunca bloqueiam. A checagem roda em transação sobre a linha `SeatLicense` (`SELECT ... FOR UPDATE`),
então duas criações simultâneas não furam o limite. A alteração do total vai para a auditoria.
Não cobertos: comandos de management/seed e o import do Movidesk (cria agentes **inativos**; ao
ativá-los vale o bloqueio).

### Resumo de ticket por IA

```http
POST /tickets/{id}/ai-summary/     (sem corpo; agente que enxerga o ticket)
200 {"summary": "...", "generated_at": "2026-10-23T12:00:00Z", "provider": "anthropic", "truncated": false}
503 {"detail": "O resumo por IA não está configurado neste ambiente.", "code": "ai_not_configured"}
502 {"detail": "...", "code": "ai_provider_error"}     404 fora do escopo     403 cliente / ticket restrito
429 teto de 20 resumos por hora por usuário
```

Configuração **só por variáveis de ambiente** (ver `.env.example`): `AI_SUMMARY_ENABLED` (padrão
desligado), `ANTHROPIC_API_KEY`, `AI_SUMMARY_MODEL` (padrão `claude-haiku-5-5`),
`AI_SUMMARY_TIMEOUT`, `AI_SUMMARY_MAX_CHARS` (padrão 12000). Provedor padrão: API da Anthropic por
HTTP (`requests`; sem dependência nova), atrás da interface `SummaryProvider`
(`apps/tickets/ai_summary.py`). **Privacidade:** vai só o assunto e as mensagens (públicas e notas
internas, sem as apagadas) com e-mail, telefone, CPF e CNPJ mascarados, autores trocados por
"Cliente"/"Agente", limitadas às mensagens mais recentes (`truncated: true` se cortou). Cada
resumo gera um `AuditLog` (ação `export`: quem, ticket, provedor, modelo, nº de mensagens; **sem
conteúdo**) e, em equipe restrita, um `TicketAccessLog`. Conteúdo e chave nunca vão para log. O
resumo **não é gravado** (sem migração). O mascaramento é por regex: nomes próprios e endereços em
texto livre não são removidos.

---

## Tipo, apagar ticket, CC e seguidores

Tudo aditivo. Migrações `tickets/0031_ticket_type`, `0032_ticket_soft_delete`, `0033_ticket_cc`.

### Tipo do ticket (`type`)

`question` (Pergunta) \| `incident` (Incidente) \| `problem` (Problema) \| `task` (Tarefa); **nulo por padrão**.

* `POST /tickets/` e `PATCH /tickets/{id}/` aceitam `type` (`null` no PATCH limpa; ausente não mexe). Como
  `assignee`/`tags`, é triagem **interna** e exige `ticket.edit_properties`: cliente ou agente leve que o
  envia leva 400 (criação) ou 400/403 (PATCH), como as demais propriedades.
* Sai em `type` na lista e no detalhe (inclusive para o cliente).
* Filtro `GET /tickets/?type=incident` — lista separada por vírgula (`question,incident`); `none` = sem
  tipo; valor desconhecido é ignorado.
* Auditoria: evento de histórico `tipo → Incidente` (`—` ao limpar), sem evento se não mudou.
* Fora do escopo (não é trivial): relatórios/CSV continuam sem a coluna de tipo.

### Apagar e restaurar ticket (exclusão **lógica**)

```http
DELETE /tickets/{id}/            (só quem tem settings.manage)
204 sem corpo
403 sem permissão   404 não existe / fora do escopo / já apagado
409 {"detail": "...", "code": "ticket_conflict"}   # horas de manutenção lançadas

POST /tickets/{id}/restore/      (só settings.manage; sem corpo)
200 detalhe do ticket   403   404 (não existe ou não está apagado)
409 {"code": "ticket_conflict"}  # passou de 30 dias
```

Decisões:

* **Soft delete**: `deleted_at`, `deleted_by`, `deleted_origin_chat_id` no ticket. Nada é removido
  (mensagens, anexos, histórico, consumo de cota ficam). Não criei a permissão `ticket.delete`: usa
  `settings.manage` (só o admin tem), porque `apps/accounts` não podia mudar nesta rodada.
* Some para **todos**: `visible_to()` e o manager padrão (`Ticket.objects`) não devolvem apagado, então
  listas, busca, filtros, facets/contadores, resumo, feed de atividade, quadros kanban, relatórios,
  tarefas de fundo (SLA, fechamento automático, lembretes de prazo do quadro) e relações
  (`company.tickets`) o ignoram. `Ticket.all_objects` enxerga tudo (usado por restauração e LGPD:
  exportação, anonimização e retenção continuam alcançando o ticket apagado).
* `GET /tickets/{id}/` de apagado: **404** para todos; o admin (`settings.manage`) recebe 200 com
  `deleted_at` e `deleted_by_name` (nulos em ticket vivo) para conferir antes de restaurar. Qualquer
  outra ação (`reply`, `PATCH`, anexos...) em ticket apagado dá 404.
* **409** se há horas de manutenção lançadas (`resolution_started_at` e `resolution_ended_at`). "Fusão
  pendente" não existe neste backend (não há fusão de tickets); quando existir, entra como outro motivo.
* Restauração só até **30 dias** depois; depois disso o registro continua no banco (política: nada é
  apagado de verdade), mas a API recusa (409).
* Auditoria: `AuditLog` (`delete`/`update`) com quem, quando, referência e assunto, mais evento no
  histórico do ticket (`ticket apagado` / `ticket restaurado`).
* Chat convertido: o chat **continua existindo**; o vínculo (`origin_chat`) vai a nulo e o chat volta a
  poder ser convertido. A restauração religa se o chat ainda estiver livre.
* Nada vaza: respostas agendadas pendentes são canceladas; e-mails já na fila são marcados `skipped`;
  `notify()`/`queue_email()` ignoram ticket apagado; avisos antigos do sino do ticket somem de
  `/notifications/`; WebSocket (`ws/me/`) não empurra mais nada do ticket — a única dica é um
  `ticket_event` `updated` (só `ticket_id` + `kind`, sem conteúdo) no ato de apagar, para as telas
  abertas revalidarem a lista.

### CC de terceiros e seguidores

Só equipe com `ticket.edit_properties` (cliente: 403). Ticket fora do escopo/inexistente: 404.

```http
GET    /tickets/{id}/cc/                      200 [{"id": 1, "name": "", "email": "a@x.com"}]
POST   /tickets/{id}/cc/  {"email": "A@X.com", "name": "Alice"}
       201 detalhe do ticket (200 se o e-mail já estava)   400 e-mail inválido, é o do solicitante, ou > 20
DELETE /tickets/{id}/cc/{cc_id}/              200 detalhe   404

GET    /tickets/{id}/followers/               200 [{"id": 7, "name": "...", "email": "...", "is_internal": false}]
POST   /tickets/{id}/followers/  {"user_id": 7}
       201 detalhe (200 se já seguia)   400 inativo / solicitante / cliente de outra empresa / inexistente
DELETE /tickets/{id}/followers/{user_id}/     200 detalhe   404
```

* O **detalhe** do ticket ganha `cc` (`[{id, name, email}]`) e `followers` (`[{id, name, email,
  is_internal}]`), **só para a equipe** (cliente recebe `[]`). `watchers` segue igual (sem e-mail).
* **CC** é e-mail de terceiro (tabela `TicketCC`): normalizado em minúsculas, sem duplicado, **até 20**
  por ticket, nunca o do solicitante. Não cria usuário nem dá acesso ao sistema.
* Recebe **um e-mail por endereço a cada resposta pública de agente** (também respostas agendadas), pelo
  mesmo outbox (`OutboundEmail`, molde `ticket_replied_cc`), com o **texto** da resposta (o CC não entra
  no portal). **Nunca** nota interna, nem resposta do cliente. Em ticket de equipe restrita vai só o
  aviso, sem o texto.
* **Seguidor** reaproveita `TicketWatcher`: usuário interno ativo, ou **cliente ativo da mesma empresa**
  do ticket (contato que acompanha sem ser o solicitante). Seguir não concede acesso (ticket restrito
  continua mascarado). O seguidor cliente que pode ler o ticket recebe aviso no sino e e-mail a cada
  resposta pública de agente.
* Auditoria: eventos de histórico `cc + a@x.com`, `cc − a@x.com`, `seguidor + Nome`, `seguidor − Nome`.
* Não há campos `cc`/`followers` no `PATCH` nem no `POST /tickets/`: só as rotas acima.

---

## Tipos TypeScript

`resolv/frontend/src/api/schema.d.ts` é gerado do YAML (`npm run generate:api`) e não é
versionado; regenerá-lo com o YAML novo compila (`npx tsc -b`) e os 1275 testes do front
do Resolv passam.
