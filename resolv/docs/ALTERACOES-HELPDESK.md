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

## Tipos TypeScript

`resolv/frontend/src/api/schema.d.ts` é gerado do YAML (`npm run generate:api`) e não é
versionado; regenerá-lo com o YAML novo compila (`npx tsc -b`) e os 1275 testes do front
do Resolv passam.
