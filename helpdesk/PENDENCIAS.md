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
- **Lista inicial = 1ª página global (100 tickets)**; cada visão do servidor pagina por conta própria (100 por vez, "Carregar mais"). A Home busca a visão "mine" além disso e a tela do ticket busca por id quando o ticket não está na lista. Telas que contam tickets a partir da store (Clientes, Organizações, histórico no painel do cliente, tags sugeridas) só enxergam o que já foi carregado: ver "No front", item 3.
- **Fechar ticket (modo real):** pelo ticket abre o diálogo `CloseResolutionModal` com início/término editáveis (pré-preenchidos com a sugestão D4; valida criação <= início <= término <= agora, no minuto, igual ao backend). **Fechar em lote ("Mudar status" > Fechado) NÃO abre diálogo**: usa a sugestão D4 por ticket, e a janela entra na franquia de horas.
- **Ordem das chamadas ao salvar:** macro, propriedades, seguir, mensagem ou fechamento, status customizado. A mensagem vai por último porque duplica se repetida.
- **Falha parcial** informa o que foi e o que não foi aplicado, mantém o texto e o "Tentar novamente" reenvia só o que falta.
- **Motor local de gatilhos desligado no modo real**, para não gravar eventos falsos em tickets reais. Os gatilhos continuam editáveis, com aviso.
- **HTML para markdown** com serializador próprio (sem dependência nova). Sublinhado, imagem e tabela viram texto.
- **Descrição de ticket novo como observação interna é recusada**, porque o POST do backend publicaria o texto ao cliente.
- **Autor da mensagem** é casado por nome (o backend não manda o id), só quando único.
- **Solicitante na lista** é resolvido por nome e empresa, com fallback para o detalhe do ticket.

## Problemas a corrigir

### No backend do Resolv (quando for permitido alterá-lo)

1. `POST /tickets/` aceita poucos campos e o corpo é sempre público; atribuído, status e tags exigem 1 a 3 chamadas extras.
2. `bulk-close` usa uma única janela de resolução para o lote; `bulk-priority` ignora ids inválidos sem reportar em `failed[]`.
3. `PATCH` aceita `is_active:false` em status de fábrica (dá para derrubar o "Novo").
4. `me.permissions` do agente inclui `macro.manage`, mas macros exigem admin (403).
5. Fechar sempre cai no stage de fábrica "Fechado".
6. Empresa exige `slug` e `plan`; cliente exige empresa e telefone.
7. Limite de login de 20 por hora responde 429 em automação.
8. A lista de tickets não traz `requester_id` nem `company_id`, e as mensagens não trazem `author_id`.
9. Reabrir ticket mantém o stage "Fechado" (caso do TD-00005).
10. Usuário do Resolv não tem `created_at` nem `updated_at`.
11. `/ticket-views/` devolve array puro, sem envelope de paginação.

### Funcionalidades que existem só no front (a criar no backend)

Gatilhos editáveis, campos personalizados, formulários de ticket, resumo de IA, fusão (ticket, usuário, organização), apagar ticket, tipo de ticket, CC e seguidores de terceiros, licenças. Também: assunto e solicitante editados num ticket existente, e campos de status, macro, cliente e organização sem equivalente no backend.

### No front

1. **Diálogo de fechamento: feito, com ressalva.** `CloseResolutionModal` (modo real, só pela tela do ticket). Verificado no navegador com o backend real, inclusive em fuso -03:00: valores gravados em `resolution_started_at`/`resolution_ended_at` conferem. Fechamento em lote segue sem diálogo (sugestão D4).
2. **Tempo real por WebSocket (`/ws/me/`): feito.** `api/real/ws.ts` + `startLiveUpdates`. Verificado: um evento de outro usuário atualiza propriedades do ticket aberto (formulário sem edições pendentes), contadores e as listas por visão já abertas, sem recarregar; reconexão com backoff após queda (simulada fechando o socket) e uma só conexão por aba. 4401/4403 não reconectam. Limite do backend: o evento só vai a quem é solicitante/responsável/dono/seguidor e **não há evento de ticket novo** (`kind`: assigned, owner, updated, closed, reply). Eventos perdidos durante uma queda não são reenviados: ao reconectar só os contadores são revalidados.
3. **Paginação por visão: feito, com ressalva importante.** Visões com `query` (6 do Helpdesk menos `recent`/`solved-recent`, as do sistema e as pessoais) paginam de 100 em 100 com "Carregar mais" (verificado com 156 tickets: 100 de 149, depois 149, sem duplicados). **Ressalva:** a store só carrega a 1ª página global; `recent` e `solved-recent` (locais), Clientes/Organizações, histórico do cliente e tags sugeridas contam apenas tickets já carregados e podem ficar incompletos com mais de 100 tickets. Filtros da gaveta numa visão paginada atuam só nas linhas carregadas. Seleção em lote atinge só linhas carregadas.
4. **Abas de trabalho: `role=group` + `aria-current`, em vez de `tablist`/`tab`.** Trade-off: o brief 5.1 pedia `tablist` (e a violação `aria-required-children` do botão "Fechar aba" dentro do `tablist` era a única conhecida). Com `group` some a violação, mas as abas deixam de ter semântica de aba (sem "aba 1 de 3" nem `aria-selected`; a ordem de Tab continua a mesma). Não rodei axe (não está instalado); só inspecionei os papéis no navegador.
5. **Menu ⋮ do ticket: feito, com ressalvas.** Criar macro vai ao backend (recusa nome repetido); fundir e apagar são **só locais** (avisados "somente neste navegador"; apagar e spam pedem confirmação). Suspender usa `PATCH /settings/users/{id}/` e depende do backend (nos dados de DEV os clientes sem telefone são recusados com "Informe ao menos um telefone"; o caminho de sucesso não foi verificado). Spam = suspender (se falhar, avisa que NÃO suspendeu) + remover localmente; não existe spam no backend.
6. **Início do admin: feito.** Execuções/sem uso mostram — quando o backend não envia contadores. Os "tetos" de assentos (5), campos (20) e gatilhos (10) são locais e vêm sinalizados; no modo real a Visão geral da conta mostra só "N agentes ativos".
7. **Conta, Canais e Espaços: páginas informativas** (sem edição). Conta = sessão + agentes ativos; Canais = texto explicativo; Espaços = layouts (texto) + atalhos reais. Marca/cobrança/SSO seguem fora.
8. **Visualizações pessoais: feito.** Criar/editar/clonar/apagar via `/ticket-views/` e filtros da gaveta (prioridade, status, assunto, solicitante, período) gravados e reidratados ao reabrir; verificado com curl. Tipo e tags não têm par no backend e não são gravados. Clonar visão do Helpdesk/sistema grava `{view: slug}`.

## Decisão em aberto

- **Contraste das bordas dos campos:** `line-strong` (2,01:1) como manda o brief, ou trocar por um token que dê 3:1 (WCAG 2.2). Também `fg-subtle` em placeholders (3,3:1) e o `ai` (#8E5FD1, 4,46:1).
