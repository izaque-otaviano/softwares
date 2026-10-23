import { describe, expect, it } from 'vitest';
import chats from '../__fixtures__/chat-chats.json';
import config from '../__fixtures__/chat-config.json';
import macros from '../__fixtures__/chat-macros.json';
import messages from '../__fixtures__/chat-messages.json';
import quickReplies from '../__fixtures__/chat-quick-replies.json';
import reasons from '../__fixtures__/chat-close-reasons.json';
import { chatConfigToDto, mapChat, mapChatConfig, mapChatFile, mapChatMacro, mapChatMedia, mapChatMessage, mapCloseReason, mapQuickReply, mapQueue, mapRoomEvent, type ChatDto, type ChatMessageDto } from './chat';

const chatDtos = chats.results as unknown as ChatDto[];

describe('mapChat (fixture real)', () => {
  it('converte ids para texto e preserva os campos de atendimento', () => {
    const active = mapChat(chatDtos.find((c) => c.status === 'active')!);
    expect(active).toMatchObject({ id: '2', clientId: '6', clientName: 'Beto Barros', agentId: '4', agentName: 'Fátima Financeiro', status: 'active', priority: 'normal', canSupervise: true, queue: null });
    expect(active.lastMessagePreview).toBe('Segue a nota em anexo.');
    expect(active.unreadCount).toBe(0);
  });

  it('chat encerrado traz avaliação, motivo e ticket vazio', () => {
    const closed = mapChat(chatDtos.find((c) => c.status === 'closed')!);
    expect(closed.rating).toMatchObject({ serviceScore: 10, resolutionScore: 9 });
    expect(closed.ticketId).toBeNull();
    expect(closed.closedAt).toBeTruthy();
    expect(closed.ratingPending).toBe(false);
  });

  it('posição na fila só existe com o chat na fila', () => {
    const queued = mapChat({ ...chatDtos[0]!, status: 'queued', queue_position: { position: 2, ahead: 1, estimated_wait_minutes: 6, queue_open: true, queue_opens_at: null } });
    expect(queued.queue).toEqual({ position: 2, ahead: 1, estimatedWaitMinutes: 6, queueOpen: true, queueOpensAt: null });
    expect(mapQueue(null)).toBeNull();
  });

  it('prioridade e presença desconhecidas caem no padrão', () => {
    const c = mapChat({ ...chatDtos[0]!, priority: 'zzz', agent_presence: 'x', client_presence: undefined });
    expect(c.priority).toBe('normal');
    expect(c.agentPresence).toBeNull();
    expect(c.clientPresence).toBeNull();
  });

  it('cliente não recebe close_note nem agent_score: ficam vazios sem quebrar', () => {
    const dto = { ...chatDtos[0]! } as Partial<ChatDto>;
    delete dto.close_note;
    delete dto.agent_score;
    const c = mapChat(dto as ChatDto);
    expect(c.closeNote).toBe('');
    expect(c.agentScore).toBeNull();
  });
});

describe('mapChatMessage (fixture real)', () => {
  const list = (messages as Record<string, unknown[]>)['2'] as ChatMessageDto[];

  it('converte autor, horário e estado de leitura', () => {
    const m = mapChatMessage(list[0]!, 2);
    expect(m).toMatchObject({ id: '4', chatId: '2', authorName: 'Beto Barros', authorIsInternal: false, isSystem: false, state: 'sent' });
    expect(m.readAt).toBeTruthy();
    expect(mapChatMessage(list[1]!, 2).authorIsInternal).toBe(true);
  });

  it('o corpo é markdown e vira HTML seguro', () => {
    const m = mapChatMessage({ ...list[0]!, body: 'Veja **isto** <script>alert(1)</script> https://exemplo.com' }, 2);
    expect(m.bodyHtml).toContain('<strong>isto</strong>');
    expect(m.bodyHtml).not.toContain('<script');
    expect(m.bodyHtml).toContain('href="https://exemplo.com"');
    expect(m.body).toContain('**isto**');
  });

  it('mensagem apagada vem sem corpo nem anexos', () => {
    const m = mapChatMessage({ ...list[0]!, body: 'segredo', is_deleted: true, files: [{ id: 1, filename: 'a.png', content_type: 'image/png', size_bytes: 3, scan_status: 'clean', url: '/api/v1/chat/files/1/', is_downloadable: true }] }, 2);
    expect(m.deleted).toBe(true);
    expect(m.body).toBe('');
    expect(m.files).toEqual([]);
  });

  it('anexo: imagem liberada, em varredura e infectado', () => {
    const base = { id: 9, filename: 'x.png', content_type: 'image/png', size_bytes: 10, url: '/api/v1/chat/files/9/' };
    expect(mapChatFile({ ...base, scan_status: 'clean', is_downloadable: true })).toMatchObject({ id: '9', isImage: true, downloadable: true, scanStatus: 'clean' });
    expect(mapChatFile({ ...base, content_type: 'application/pdf', scan_status: 'pending', is_downloadable: false })).toMatchObject({ isImage: false, downloadable: false, scanStatus: 'pending' });
    expect(mapChatFile({ ...base, scan_status: 'nada', is_downloadable: false }).scanStatus).toBe('pending');
  });

  it('citação (reply_preview) e chat_id do WebSocket', () => {
    const m = mapChatMessage({ ...list[0]!, chat_id: 77, reply_to: 3, reply_preview: { id: 3, author_name: 'X', excerpt: 'oi', is_deleted: false, has_files: true } }, 2);
    expect(m.chatId).toBe('77');
    expect(m.replyTo).toEqual({ id: '3', authorName: 'X', excerpt: 'oi', deleted: false, hasFiles: true });
  });

  it('mídia do atendimento', () => {
    const media = mapChatMedia({ files: [{ id: 1, filename: 'a.txt', content_type: 'text/plain', size_bytes: 3, scan_status: 'clean', url: '/u', is_downloadable: true, message_id: 5, sent_at: 's' }], links: [{ url: 'https://a.com', chat_id: 1, message_id: 5, sent_at: 's', author_name: 'Z' }] });
    expect(media.files[0]).toMatchObject({ messageId: '5', sentAt: 's' });
    expect(media.links[0]).toEqual({ url: 'https://a.com', messageId: '5', sentAt: 's', authorName: 'Z' });
  });
});

describe('cadastros do chat (fixtures reais)', () => {
  it('motivos de encerramento', () => {
    const list = (reasons.results as any[]).map(mapCloseReason);
    expect(list[0]).toEqual({ id: '1', name: 'Resolvido', slug: 'resolvido', requiresNote: false, active: true, order: 0 });
    expect(list.some((r) => r.requiresNote)).toBe(true);
  });

  it('respostas rápidas mantêm o contexto', () => {
    const list = (quickReplies.results as any[]).map(mapQuickReply);
    expect(list.find((q) => q.label === 'Problema com um pedido')).toMatchObject({ context: 'chat', active: true });
    expect(list.some((q) => q.context === 'ticket')).toBe(true);
  });

  it('macro de chat', () => {
    const m = mapChatMacro((macros.results as any[])[0]);
    expect(m).toMatchObject({ id: '1', name: 'Pedir mais informação', active: true });
    expect(m.body).toContain('{{solicitante}}');
  });

  it('configuração e ida de volta ao corpo do PUT', () => {
    const c = mapChatConfig(config as any);
    expect(c).toMatchObject({ queueTimeoutMinutes: 10, maxChatsPerAgent: 3, scoreMin: 0, scoreMax: 10, lowScoreThreshold: 5, defaultTeamId: null });
    const body = chatConfigToDto({ welcomeMessage: 'oi', defaultTeamId: '3', maxChatsPerAgent: 4 });
    expect(body).toEqual({ welcome_message: 'oi', default_team: 3, max_chats_per_agent: 4 });
    expect(chatConfigToDto({ defaultTeamId: null })).toEqual({ default_team: null });
  });
});

describe('mapRoomEvent', () => {
  it('mensagem, editada e apagada', () => {
    const raw = { type: 'message', id: 10, author_name: 'A', author_is_internal: true, body: 'oi', is_system: false, is_internal_note: false, sent_at: 's', read_at: null, delivered_at: null, files: [], edited_at: null, is_deleted: false, can_edit: true, reply_to: null, reply_preview: null };
    const ev = mapRoomEvent(raw, 5)!;
    expect(ev.type).toBe('message');
    expect(ev.type === 'message' && ev.message).toMatchObject({ id: '10', chatId: '5', body: 'oi' });
    expect(mapRoomEvent({ ...raw, type: 'message_deleted', is_deleted: true }, 5)).toMatchObject({ type: 'message_deleted' });
    expect(mapRoomEvent({ type: 'message' }, 5)).toBeNull();
  });

  it('entrega, leitura, digitação, atribuição, encerramento, conversão e fila', () => {
    expect(mapRoomEvent({ type: 'message_delivered', ids: [1, 2] }, 1)).toEqual({ type: 'delivered', ids: ['1', '2'] });
    expect(mapRoomEvent({ type: 'message_read', ids: [3] }, 1)).toEqual({ type: 'read', ids: ['3'] });
    expect(mapRoomEvent({ type: 'typing', user_id: 7, user_name: 'Z', is_typing: false }, 1)).toEqual({ type: 'typing', userId: '7', userName: 'Z', isTyping: false });
    expect(mapRoomEvent({ type: 'accepted', agent_name: 'Ana' }, 1)).toEqual({ type: 'accepted', agentName: 'Ana' });
    expect(mapRoomEvent({ type: 'transferred', agent_name: 'Bia' }, 1)).toEqual({ type: 'transferred', agentName: 'Bia' });
    expect(mapRoomEvent({ type: 'closed', by_internal: true }, 1)).toEqual({ type: 'closed', byInternal: true });
    expect(mapRoomEvent({ type: 'converted', ticket_id: 4, ticket_reference: 'TD-4' }, 1)).toEqual({ type: 'converted', ticketId: '4', ticketReference: 'TD-4' });
    expect(mapRoomEvent({ type: 'queue_position', chat_id: 1, position: 3, ahead: 2, estimated_wait_minutes: null, queue_open: false, queue_opens_at: 'x' }, 1)).toEqual({
      type: 'queue_position',
      queue: { position: 3, ahead: 2, estimatedWaitMinutes: null, queueOpen: false, queueOpensAt: 'x' },
    });
    expect(mapRoomEvent({ type: 'error', detail: 'Mensagem vazia.' }, 1)).toEqual({ type: 'error', detail: 'Mensagem vazia.' });
    expect(mapRoomEvent({ type: 'desconhecido' }, 1)).toBeNull();
  });
});
