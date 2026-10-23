# Pendências e decisões do Helpdesk

Registro do que ficou para corrigir e do que foi decidido. Quando o dono do projeto perguntar por "problemas", é esta lista que deve ser lembrada e cobrada.

Detalhes técnicos de cada ponto de integração: `src/api/PENDENTE_NO_BACKEND.md`.

## Decisões do dono do projeto

1. **Nada é escondido.** O que o backend não tem continua funcionando localmente no navegador, marcado como "somente neste navegador", até ser criado no backend.
2. **O backend do Resolv não é alterado.** O front se adapta a ele.
3. **Mensagens em markdown** (formato do backend). O Tiptap converte para markdown ao enviar e o markdown vira HTML sanitizado ao ler.
4. **O Helpdesk é só para agentes e admins.** Contas de cliente são recusadas no login.
5. **Projeto publicado em** `izaque-otaviano/softwares`, pasta `helpdesk/`, branch `claude/ticket-system-8tsh8q`. O Resolv (`izaqueotaviano/Resolv`, agora CDesk) segue intacto.

## Decisões técnicas tomadas

- **Fachada de API** `mock | real` por `VITE_API_MODE`. Os testes rodam sempre em mock.
- **Lista inicial = 1ª página global (100 tickets)**; cada visão do servidor pagina por conta própria (100 por vez, "Carregar mais"). A Home busca a visão "mine" além disso e a tela do ticket busca por id quando o ticket não está na lista. O histórico do cliente (perfil e painel do ticket) e os tickets da organização **vão ao servidor** (`?requester=`, `?company=`, todas as páginas até 500) e não dependem mais dos 100 primeiros. Só as tags sugeridas ainda leem o que está na store: ver "No front", item 3.
- **Fechar ticket (modo real):** pelo ticket abre o diálogo `CloseResolutionModal` com início/término editáveis (pré-preenchidos com a sugestão D4; valida criação <= início <= término <= agora, no minuto, igual ao backend). **Fechar em lote ("Mudar status" > status resolvido) abre `BulkCloseModal`**: quantidade, política (cada ticket usa a sua janela sugerida), início e fim de cada ticket, término comum editável; envia `bulk-close` com `items`. Falhas por ticket (`failed[]`) ficam no diálogo, com o motivo, e dá para reenviar só elas. A janela entra na franquia de horas.
- **Ordem das chamadas ao salvar:** macro, propriedades, seguir, mensagem ou fechamento, status por coluna (`bulk-status`, só quando não há resposta pública nem fechamento). A mensagem vai por último porque duplica se repetida.
- **Criar ticket = 1 chamada** (`POST /tickets/` com `assignee`, `stage`, `tags`, `is_public`). Só seguir, macros e fechar já na criação continuam em chamadas seguintes. Recusa do backend = 400 sem ticket criado.
- **Falha parcial** informa o que foi e o que não foi aplicado, mantém o texto e o "Tentar novamente" reenvia só o que falta.
- **Motor local de gatilhos desligado no modo real**, para não gravar eventos falsos em tickets reais. Os gatilhos continuam editáveis, com aviso.
- **HTML para markdown** com serializador próprio (sem dependência nova). Sublinhado, imagem e tabela viram texto.
- **Descrição de ticket novo como observação interna** vai com `is_public:false` (o cliente nunca a vê); exige a permissão `ticket.add_internal_note`.
- **Autor da mensagem** vem de `author_id`; sem id (autor oculto) vira `name:<nome>` e a tela mostra o nome. **Solicitante** e **empresa** vêm de `requester_id`/`company_id` da lista; ticket restrito (ids nulos) fica sem solicitante e mostra o nome mascarado. Nada é casado por nome e não há chamadas de detalhe só para descobrir o solicitante.
- **Permissões** (`me.permissions`) ficam na sessão (`lib/permissions.ts`): o agente sem `macro.manage` nem `settings.manage` não vê criar/editar macro; a criação não auto-atribui ao criador sem `ticket.edit_properties`.
- **Login 429**: a tela mostra o `detail` do backend e a espera (`Retry-After` ou `retry_after`), com contagem regressiva e botão desabilitado.

## Problemas a corrigir

### No backend do Resolv (quando for permitido alterá-lo)

Da lista anterior (11 itens) só o antigo item 6 (empresa e cliente exigem campos) continua. Os outros dez (criar ticket triado, lote com janela por ticket e `failed[]`, status de fábrica, `macro.manage`, fechar em status personalizado, limite de login 429, `requester_id`/`company_id`/`author_id`, reabrir, `created_at`/`updated_at` e envelope de `/ticket-views/`) foram corrigidos no backend e verificados no Helpdesk contra o backend novo (detalhes em `src/api/PENDENTE_NO_BACKEND.md`; o 429 foi testado com resposta simulada, sem esgotar o login real). Pontos novos encontrados:

1. (antigo 6) Empresa exige `slug` e `plan`; cliente exige empresa e telefone (o front deriva o slug e pede plano, empresa e telefone no modal).
2. `bulk-close` não aceita `stage`: para fechar em lote num status personalizado da categoria fechada o front faz um `close/` por ticket.
3. Os eventos do ticket trazem só `actor_name` (sem `actor_id`): o autor do evento é casado por nome.
4. `GET /tickets/` não filtra por lista de ids: depois de uma ação em lote o front relê cada ticket alterado (`GET /tickets/{id}/`).
5. `GET /settings/teams/roster/` devolve equipes desativadas junto com as ativas (o front as ignora ao escolher a equipe do ticket novo).

### Funcionalidades que existem só no front (a criar no backend)

Gatilhos editáveis, campos personalizados, formulários de ticket, resumo de IA, fusão (ticket, usuário, organização), apagar ticket, tipo de ticket, CC e seguidores de terceiros, licenças. Também: assunto e solicitante editados num ticket existente, e campos de status, macro, cliente e organização sem equivalente no backend.

### No front

1. **Diálogo de fechamento: feito.** `CloseResolutionModal` (tela do ticket) e `BulkCloseModal` (lote, também no mock). Verificado no navegador com o backend novo: janelas gravadas conferem (`resolution_started_at`/`resolution_ended_at`), término comum editável, falha por ticket listada com o motivo e reenvio só dos que falharam. Status personalizado fechado vai por `stage` (`close/` e `reply`); no lote vira um `close/` por ticket (o `bulk-close` não tem `stage`).
2. **Tempo real por WebSocket (`/ws/me/`): feito.** `api/real/ws.ts` + `startLiveUpdates`. Verificado: um evento de outro usuário atualiza propriedades do ticket aberto (formulário sem edições pendentes), contadores e as listas por visão já abertas, sem recarregar; reconexão com backoff após queda (simulada fechando o socket) e uma só conexão por aba. 4401/4403 não reconectam. Limite do backend: o evento só vai a quem é solicitante/responsável/dono/seguidor e **não há evento de ticket novo** (`kind`: assigned, owner, updated, closed, reply). Eventos perdidos durante uma queda não são reenviados: ao reconectar só os contadores são revalidados.
3. **Paginação por visão: feito, com ressalva.** Visões com `query` (6 do Helpdesk menos `recent`/`solved-recent`, as do sistema e as pessoais) paginam de 100 em 100 com "Carregar mais" (verificado com 156 tickets: 100 de 149, depois 149, sem duplicados). **Histórico do cliente, painel do cliente no ticket e tickets da organização: resolvido**, vêm do servidor (`?requester=`/`?company=`; verificado: Ana 54, Beto 49, Acme 103, iguais às contagens do servidor, com mais de 100 na organização). **Ressalva (continua):** `recent` e `solved-recent` (locais) e as tags sugeridas contam apenas tickets já carregados e podem ficar incompletos com mais de 100 tickets. Filtros da gaveta numa visão paginada atuam só nas linhas carregadas. Seleção em lote atinge só linhas carregadas. `/ticket-views/?page=` não é usado: o array puro devolve todas as visões, e o front precisa do `count` de todas para o contador.
4. **Abas de trabalho: `role=group` + `aria-current`, em vez de `tablist`/`tab`.** Trade-off: o brief 5.1 pedia `tablist` (e a violação `aria-required-children` do botão "Fechar aba" dentro do `tablist` era a única conhecida). Com `group` some a violação, mas as abas deixam de ter semântica de aba (sem "aba 1 de 3" nem `aria-selected`; a ordem de Tab continua a mesma). Não rodei axe (não está instalado); só inspecionei os papéis no navegador.
5. **Menu ⋮ do ticket: feito, com ressalvas.** Criar macro vai ao backend (recusa nome repetido) e só aparece para quem tem `macro.manage` ou `settings.manage`; fundir e apagar são **só locais** (avisados "somente neste navegador"; apagar e spam pedem confirmação). Suspender usa `PATCH /settings/users/{id}/` e depende do backend (nos dados de DEV os clientes sem telefone são recusados com "Informe ao menos um telefone"; o caminho de sucesso não foi verificado). Spam = suspender (se falhar, avisa que NÃO suspendeu) + remover localmente; não existe spam no backend.
6. **Início do admin: feito.** Execuções/sem uso mostram — quando o backend não envia contadores. Os "tetos" de assentos (5), campos (20) e gatilhos (10) são locais e vêm sinalizados; no modo real a Visão geral da conta mostra só "N agentes ativos".
7. **Conta, Canais e Espaços: páginas informativas** (sem edição). Conta = sessão + agentes ativos; Canais = texto explicativo; Espaços = layouts (texto) + atalhos reais. Marca/cobrança/SSO seguem fora.
8. **Visualizações pessoais: feito.** Criar/editar/clonar/apagar via `/ticket-views/` e filtros da gaveta (prioridade, status, assunto, solicitante, período) gravados e reidratados ao reabrir; verificado com curl. Tipo e tags não têm par no backend e não são gravados. Clonar visão do Helpdesk/sistema grava `{view: slug}`.

## Decisão em aberto

- **Contraste das bordas dos campos:** `line-strong` (2,01:1) como manda o brief, ou trocar por um token que dê 3:1 (WCAG 2.2). Também `fg-subtle` em placeholders (3,3:1) e o `ai` (#8E5FD1, 4,46:1).
