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
- **Carregar todos os tickets paginados** e filtrar no cliente (volume pequeno). Revisar se o volume real for grande.
- **Fechar ticket sem diálogo.** Janela de resolução = sugestão do backend: início na primeira abertura do ciclo (senão criação), fim agora. Entra na franquia de horas de manutenção da empresa.
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

1. **Diálogo de fechamento** com os dois horários editáveis (hoje usa a janela automática).
2. **Tempo real por WebSocket** (`/ws/me/`); hoje o front faz atualização local simulada e no modo real ela fica desligada.
3. **Volume:** só foi testado com o seed (6 tickets). Medir o carregamento de tudo com milhares de tickets.
4. **Tablist das abas de trabalho:** única violação de acessibilidade restante (botão "Fechar aba" dentro do `role=tablist`).
5. **Menu ⋮ do ticket:** criar macro, fundir, suspender, spam e apagar só mostram toast no modo mock.
6. **Início do admin:** "execuções 24 h" é estimada, e os limites do cartão de uso são valores provisórios.
7. **Conta, Canais e Espaços de trabalho** abrem "Fora desta versão".

## Decisão em aberto

- **Contraste das bordas dos campos:** `line-strong` (2,01:1) como manda o brief, ou trocar por um token que dê 3:1 (WCAG 2.2). Também `fg-subtle` em placeholders (3,3:1) e o `ai` (#8E5FD1, 4,46:1).
