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

Gatilhos editáveis, campos personalizados (inclui tópico, sentimento e idioma de IA), formulários de ticket e fusão (ticket, usuário, organização). Também: assunto e solicitante editados num ticket existente, e campos de status, macro, cliente e organização sem equivalente no backend.

### No front

1. **Diálogo de fechamento: feito.** `CloseResolutionModal` (tela do ticket) e `BulkCloseModal` (lote, também no mock). Verificado no navegador com o backend novo: janelas gravadas conferem (`resolution_started_at`/`resolution_ended_at`), término comum editável, falha por ticket listada com o motivo e reenvio só dos que falharam. Status personalizado fechado vai por `stage` (`close/` e `reply`); no lote vira um `close/` por ticket (o `bulk-close` não tem `stage`).
2. **Tempo real por WebSocket (`/ws/me/`): feito.** `api/real/ws.ts` + `startLiveUpdates`. Verificado: um evento de outro usuário atualiza propriedades do ticket aberto (formulário sem edições pendentes), contadores e as listas por visão já abertas, sem recarregar; reconexão com backoff após queda (simulada fechando o socket) e uma só conexão por aba. 4401/4403 não reconectam. Limite do backend: o evento só vai a quem é solicitante/responsável/dono/seguidor e **não há evento de ticket novo** (`kind`: assigned, owner, updated, closed, reply). Eventos perdidos durante uma queda não são reenviados: ao reconectar só os contadores são revalidados.
3. **Paginação por visão: feito, com ressalva.** Visões com `query` (6 do Helpdesk menos `recent`/`solved-recent`, as do sistema e as pessoais) paginam de 100 em 100 com "Carregar mais" (verificado com 156 tickets: 100 de 149, depois 149, sem duplicados). **Histórico do cliente, painel do cliente no ticket e tickets da organização: resolvido**, vêm do servidor (`?requester=`/`?company=`; verificado: Ana 54, Beto 49, Acme 103, iguais às contagens do servidor, com mais de 100 na organização). **Ressalva (continua):** `recent` e `solved-recent` (locais) e as tags sugeridas contam apenas tickets já carregados e podem ficar incompletos com mais de 100 tickets. Filtros da gaveta numa visão paginada atuam só nas linhas carregadas. Seleção em lote atinge só linhas carregadas. `/ticket-views/?page=` não é usado: o array puro devolve todas as visões, e o front precisa do `count` de todas para o contador.
4. **Abas de trabalho: `role=group` + `aria-current`, em vez de `tablist`/`tab`.** Trade-off: o brief 5.1 pedia `tablist` (e a violação `aria-required-children` do botão "Fechar aba" dentro do `tablist` era a única conhecida). Com `group` some a violação, mas as abas deixam de ter semântica de aba (sem "aba 1 de 3" nem `aria-selected`; a ordem de Tab continua a mesma). Não rodei axe (não está instalado); só inspecionei os papéis no navegador.
5. **Menu ⋮ do ticket: feito, com ressalvas.** Criar macro vai ao backend (recusa nome repetido) e só aparece para quem tem `macro.manage` ou `settings.manage`; **apagar vai ao servidor** (só `settings.manage`; ver "Tipo, apagar, CC e seguidores, licenças e resumo de IA") e fundir segue **só local** ("somente neste navegador"); apagar, spam e fundir pedem confirmação. Suspender usa `PATCH /settings/users/{id}/` e depende do backend (nos dados de DEV os clientes sem telefone são recusados com "Informe ao menos um telefone"; o caminho de sucesso não foi verificado). Spam = suspender (se falhar, avisa que NÃO suspendeu) + apagar no servidor (só admin); não existe spam no backend.
6. **Início do admin: feito.** Execuções/sem uso mostram — quando o backend não envia contadores. Licenças vêm do servidor (`/settings/licenses/`, barra "N de total" ou "N (sem limite)"); os "tetos" de campos (20) e gatilhos (10) continuam locais e sinalizados. A Visão geral da conta mostra as licenças do servidor.
7. **Conta, Canais e Espaços: páginas informativas** (sem edição). Conta = sessão + agentes ativos; Canais = texto explicativo; Espaços = layouts (texto) + atalhos reais. Marca/cobrança/SSO seguem fora.
8. **Visualizações pessoais: feito.** Criar/editar/clonar/apagar via `/ticket-views/` e filtros da gaveta (prioridade, status, assunto, solicitante, período) gravados e reidratados ao reabrir; verificado com curl. Tags não têm par no backend e não são gravadas; o tipo também não é gravado na visão pessoal (o backend recusa `type` em `filters`), mas o filtro de tipo da gaveta vai ao servidor ao listar. Clonar visão do Helpdesk/sistema grava `{view: slug}`.

## Áreas novas (Quadro, Chat, Relatórios, Sistema)

Todas funcionam no modo mock e no real. O que o backend não tem fica marcado "somente neste navegador".

### Só no front (a criar no backend)
- Quadro: a ordem dentro da coluna não é gravada; "adicionar ticket ao quadro" não existe (o quadro mostra todos os não resolvidos; o prazo interno e as colunas de organização são os equivalentes reais).
- SLA: metas por prioridade e calendário aplicado à política; feriado "repete todo ano".
- Backups: nome do backup e retenção editável (a retenção vem de `BACKUP_ROTATION_DAYS`).
- Chat: não há resposta rápida do agente (as rápidas do backend são frases do cliente); macros de chat não substituem `{{solicitante}}`/`{{empresa}}` no servidor.

### Defeitos do backend encontrados
- Exportações/downloads (`reports/tickets/export`, backups, PDF do chat) respondem 406 se o `Accept` não for `*/*`.
- `reports/indicators`: variações absurdas (+17200%) e `previous_start` desalinhado em intervalo livre. `chat/reports` não filtra por período nem responsável. CSV exporta `status`/`source` crus.
- Kanban: `entries()` filtra por `team_id` (card de outra equipe nunca aparece); `kanban.move` não é checada no servidor; lane duplicada devolve erro em inglês técnico.
- Auditoria: logs sem filtro por ticket, data final ou texto; prazos de retenção não expostos; `audit.view` existe mas as views exigem `settings.manage`; candidatos de redação trazem só o rótulo, não o trecho.
- Planos: `slug` obrigatório e não derivado; sem rota para excluir. Erro de unicidade (SLA, feriado) em inglês técnico.
- Chat: mensagens sem id do autor (só nome); `close`/`join`/`leave` não checam o dono; `can_edit` do WebSocket vale para a sala toda; a fila é reenviada a cada conexão de `ws/me`.

### Verificado só em teste (não no navegador real)
Restaurar backup, executar/anonimizar/rejeitar LGPD, ativar/desativar 2FA, trocar senha, encerrar sessões, criar/excluir quadro, entrar/assumir/sair do chat. Ações destrutivas nunca foram executadas contra o banco compartilhado.

### Resíduos de teste no banco de desenvolvimento (prefixo AG-)
Tickets TD-00176 a 178, chats 3 a 7 e usuários ag-chat-1..5, plano e avisos AG-adminA, pedidos LGPD 1 e 2 e ciclo de retenção 1. Sem rota de exclusão; ignorar ou rejeitar.

### Ligações feitas no shell
Sino de notificações no `TopBar`, banner de avisos no `AgentLayout` e "Sessões e acessos" no menu de membros. "Ver todas" do sino leva a `/admin/notificacoes/central` (área de admin): para agente comum falta uma rota fora de `/admin`.

## Tipo, apagar, CC e seguidores, licenças e resumo de IA: feito

Cinco itens que eram só do front passaram a usar o backend novo (`capabilities` `'real'`; detalhes e ressalvas em `src/api/PENDENTE_NO_BACKEND.md`). Verificado no navegador contra o backend (porta 8021) com tickets `AG-front`:
tipo (criar, trocar, limpar, eventos "tipo → X" no histórico e filtro `?type=` na gaveta), apagar (menu ⋮ e lote, 404 ao apagar de novo, ticket continua se falha), banner "Apagado em… Restaurar", CC (e-mail inválido, do solicitante, repetido, remover) e seguidores, criação com tipo+CC+seguidor, licenças (ler, 400 abaixo do uso, editar total, 409 ao criar, voltar a "sem limite") e resumo de IA (503 sem chave).

Ressalvas: o 409 de horas lançadas, o 403 (agente não admin), o 429/502 do resumo e a restauração depois de 30 dias foram verificados só em teste com resposta simulada; o resumo com chave configurada não foi chamado (nenhum provedor externo); os campos de IA do painel (tópico, sentimento, idioma) seguem locais.

### Defeitos do backend encontrados
- `type` não está na lista `VALIDADORES` de `SavedTicketView.filters`: visão pessoal não consegue gravar filtro de tipo (400 "Filtro desconhecido").
- A mensagem de 409 `seat_limit_reached` cita "Configurações > Licenças", que não existe no Helpdesk.
- Eventos de auditoria de propriedade (tipo, CC, seguidor, apagar) usam o mesmo formato de evento de status (`from_status` = `to_status` com `note`); o front precisa deduzir pelo `note` que não é troca de status.

## Decisão em aberto

- **Contraste das bordas dos campos:** `line-strong` (2,01:1) como manda o brief, ou trocar por um token que dê 3:1 (WCAG 2.2). Também `fg-subtle` em placeholders (3,3:1) e o `ai` (#8E5FD1, 4,46:1).
