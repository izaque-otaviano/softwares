# Contrato da tela do ticket (Fase 3)

Chave do formulário = id da aba de trabalho: `ticket:ID` ou `new-ticket:N` (`isNewKey`, `ticketIdFromKey`).
Ao criar um ticket novo, a MESMA aba vira `ticket:ID` e o formulário muda de chave (slots recebem a nova `ticketKey`).

## Slots (props `{ ticketKey: string }`; não mude as assinaturas, só sobrescreva o corpo)
- `Conversation.tsx` -> `Conversation` (centro, `flex-1 min-h-0`, rola sozinho; só em ticket existente)
- `Composer.tsx` -> `Composer` (fundo do centro; também no ticket novo, logo abaixo do Assunto)
- `BottomBar.tsx` -> `BottomBar` (`h-bottombar`, largura total). Ctrl/Cmd+Enter já é tratado em `TicketScreen`.
- `RightRail.tsx` -> `TicketRightRail` (3a coluna). Fechado devolve `null`; aberto renderiza a própria coluna `w-right`.
  Em ticket novo, mostre o cartão do cliente quando `values.requesterId` existir.
- `panels/` é de vocês. O trilho de ícones `w-rail2` continua em `components/shell/RightRail.tsx` (AgentLayout).

## formStore (`useFormStore`, hook `useFormEntry(key)`)
`entry`: `values{subject,requesterId,assigneeGroupId,assigneeId,followerIds,ccIds,tags,type,priority,statusId,customFields}`,
`original`, `replyMode('public'|'internal'|'call')`, `callNumber`, `bodyHtml`, `bodyRev`, `ccOpen`, `stayOnTicket`,
`submitting`, `errors{subject,requester,assignee,comment}`, `apiError`, `isNew`, `ticketId`.
Ações: `init(key, ticket|null)` (idempotente), `patch`, `setReplyMode`, `setCallNumber`, `setBody`, `setCcOpen`,
`setStayOnTicket`, `applyMacro(key, macro)`, `isDirty`, `reset`, `submit(key, statusIdOverride?)`, `retry`, `clearErrors`, `remove`.
- O editor chama `setBody(key, html)` a cada mudança. Quando `bodyRev` muda (macro, envio, reset) o Composer deve reler `bodyHtml`.
- `submit` devolve `{ok:true, ticketId, created, ticket}` ou `{ok:false, kind:'validation'|'api'|'busy'|'missing', error}`.
  Em erro de API o texto fica; `TicketScreen` mostra o Banner "Tentar novamente" (`retry`). Erros de campo ficam em `errors`.
- Status do SplitButton: `submit(key, statusId)` grava o status no formulário e envia na hora; o botão principal usa `submit(key)`.
- Dirty da aba é sincronizado sozinho (`useTabs.setDirty`); fechar a aba descarta o formulário.

## Gatilhos e API
`lib/triggers.ts` (`runTriggers`) roda dentro do `submit` sobre `db.triggers`; notificações viram `AuditEvent`
(`kind:'notification'`, `authorId:'system'`, `text` com "— Gatilho {nome}", `meta.triggerId`). Há também o evento "Ticket criado" da API.
`useTickets.createTicket/updateTicket` aceitam `{silent:true}`; `useTickets.applyAutomation(id, patch, events)` grava o resultado dos gatilhos.
