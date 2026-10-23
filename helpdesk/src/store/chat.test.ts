import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/api';
import { resetChatMock } from '@/api/mock/chat';
import { useUi } from '@/store/useUi';
import type { ChatMessage } from '@/types/chat';
import { mergeMessages, resetChatStore, useChatStore } from './chat';

const msg = (id: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: String(id), chatId: '1', authorName: 'X', authorIsInternal: false, body: `m${id}`, bodyHtml: '', isSystem: false, isInternalNote: false,
  sentAt: '2026-10-22T10:00:00Z', readAt: null, deliveredAt: null, files: [], editedAt: null, deleted: false, canEdit: false, replyTo: null, state: 'sent', ...extra,
});

/** `simulate` do mock usa setTimeout: com relógio falso é preciso avançar para a chamada resolver. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  void p.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 30 && !done; i++) await vi.advanceTimersByTimeAsync(1);
  return p;
}

const flush = async (ms = 1) => {
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => {
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  resetChatMock();
  resetChatStore();
  useUi.setState({ toasts: [] });
  vi.useFakeTimers();
});
afterEach(() => {
  resetChatStore();
  resetChatMock();
  vi.useRealTimers();
});

describe('mergeMessages', () => {
  it('não duplica por id, mantém a ordem do servidor e a última versão vence', () => {
    const merged = mergeMessages([msg(3), msg(1)], [msg(2), msg(3, { body: 'editada', editedAt: 'x' }), msg(1)]);
    expect(merged.map((m) => m.id)).toEqual(['1', '2', '3']);
    expect(merged[2]).toMatchObject({ body: 'editada', editedAt: 'x' });
  });
});

describe('listas', () => {
  it('Fila vem do mais antigo para o mais novo; contadores batem com as abas', async () => {
    const s = useChatStore.getState();
    await settle(s.loadList('queue'));
    await settle(s.refreshCounts());
    const st = useChatStore.getState();
    expect(st.lists.queue.items.map((c) => c.id)).toEqual(['2', '1']);
    expect(st.lists.queue.items[0]!.queue).toMatchObject({ position: 1 });
    expect(st.counts).toEqual({ queue: 2, mine: 2, all: 8 });
  });

  it('busca filtra por cliente e por conteúdo da mensagem', async () => {
    useChatStore.setState({ query: 'checkout' });
    await settle(useChatStore.getState().loadList('all'));
    expect(useChatStore.getState().lists.all.items.map((c) => c.id)).toEqual(['3']);
    useChatStore.setState({ query: 'zzzz' });
    await settle(useChatStore.getState().loadList('all'));
    expect(useChatStore.getState().lists.all.items).toEqual([]);
  });

  it('filtro de status em Todas', async () => {
    useChatStore.setState({ statusFilter: 'closed' });
    await settle(useChatStore.getState().loadList('all'));
    expect(useChatStore.getState().lists.all.items.every((c) => c.status === 'closed')).toBe(true);
  });
});

describe('conversa e tempo real (mock)', () => {
  it('abre a conversa, carrega mensagens e liga a sala; sair limpa tudo', async () => {
    const s = useChatStore.getState();
    s.start();
    await settle(s.select('3'));
    await flush();
    const conv = useChatStore.getState().conversation!;
    expect(conv.chat?.clientName).toBe('Carlos Menezes');
    expect(conv.messages.length).toBeGreaterThan(3);
    expect(conv.connected).toBe(true);
    s.stop();
    expect(useChatStore.getState().conversation).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('envia texto: aparece "enviando" e é confirmado pelo servidor sem duplicar; o cliente responde depois', async () => {
    const s = useChatStore.getState();
    await settle(s.select('3'));
    await flush();
    const before = useChatStore.getState().conversation!.messages.length;
    expect(s.sendText('Pode testar agora?')).toBe(true);
    expect(useChatStore.getState().conversation!.pending).toHaveLength(1);
    expect(useChatStore.getState().conversation!.pending[0]!.state).toBe('sending');
    await flush(1);
    const conv = useChatStore.getState().conversation!;
    expect(conv.pending).toHaveLength(0);
    expect(conv.messages).toHaveLength(before + 1);
    expect(conv.messages.filter((m) => m.body === 'Pode testar agora?')).toHaveLength(1);
    // o cliente simulado "digita" e responde alguns segundos depois
    await flush(2300);
    expect(useChatStore.getState().conversation!.typingName).toBe('Carlos Menezes');
    await flush(2000);
    const after = useChatStore.getState().conversation!;
    expect(after.typingName).toBeNull();
    expect(after.messages).toHaveLength(before + 2);
    expect(after.messages.at(-1)!.authorIsInternal).toBe(false);
    s.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('nota interna não dispara resposta do cliente', async () => {
    const s = useChatStore.getState();
    await settle(s.select('3'));
    await flush();
    s.sendText('lembrar do estorno', { internalNote: true });
    await flush(10_000);
    const msgs = useChatStore.getState().conversation!.messages;
    expect(msgs.at(-1)).toMatchObject({ isInternalNote: true, body: 'lembrar do estorno' });
    s.stop();
  });

  it('sem conexão (sala fechada) devolve false e não cria mensagem fantasma', async () => {
    const s = useChatStore.getState();
    await settle(s.select('3'));
    expect(s.sendText('   ')).toBe(false);
    expect(useChatStore.getState().conversation!.pending).toHaveLength(0);
    s.stop();
    expect(s.sendText('oi')).toBe(false);
  });

  it('pegar da fila vira conversa minha e escreve mensagem de sistema na sala', async () => {
    const s = useChatStore.getState();
    await settle(s.select('1'));
    await flush();
    expect(useChatStore.getState().conversation!.chat?.status).toBe('queued');
    expect(await settle(s.take())).toBe(true);
    await flush(5);
    const conv = useChatStore.getState().conversation!;
    expect(conv.chat).toMatchObject({ status: 'active', agentId: 'me' });
    expect(conv.messages.some((m) => m.isSystem && m.body.includes('entrou na conversa'))).toBe(true);
    expect(conv.messages.filter((m) => m.isSystem && m.body.includes('entrou na conversa'))).toHaveLength(1);
    s.stop();
  });

  it('encerrar exige a observação do motivo "Outro"; com ela encerra e reabrir volta para a fila', async () => {
    const s = useChatStore.getState();
    await settle(s.select('3'));
    await flush();
    expect(await settle(s.close({ reasonId: '6' }))).toBe(false);
    expect(useUi.getState().toasts.at(-1)?.title).toMatch(/pede uma observação/);
    expect(await settle(s.close({ reasonId: '6', note: 'cliente sumiu' }))).toBe(true);
    await flush(5);
    expect(useChatStore.getState().conversation!.chat).toMatchObject({ status: 'closed', closeReasonName: 'Outro', closeNote: 'cliente sumiu' });
    expect(await settle(s.reopen('voltou'))).toBe(true);
    expect(useChatStore.getState().conversation!.chat).toMatchObject({ status: 'queued', agentId: null, reopenCount: 1 });
    s.stop();
  });

  it('converter em ticket cria o ticket, encerra a conversa e guarda o vínculo', async () => {
    const s = useChatStore.getState();
    await settle(s.select('4'));
    await flush();
    expect(await settle(s.convert('g1'))).toBe(true);
    const chat = useChatStore.getState().conversation!.chat!;
    expect(chat.status).toBe('closed');
    expect(chat.ticketId).toBeTruthy();
    s.stop();
  });

  it('transferir para outro agente muda quem atende', async () => {
    const s = useChatStore.getState();
    await settle(s.select('4'));
    await flush();
    expect(await settle(s.transfer('a2', 'obs'))).toBe(true);
    expect(useChatStore.getState().conversation!.chat).toMatchObject({ agentId: 'a2', agentName: 'Rafael Pinto' });
    s.stop();
  });

  it('trocar de conversa rápido descarta a resposta da anterior', async () => {
    const s = useChatStore.getState();
    const first = s.select('3');
    const second = s.select('4');
    await settle(Promise.all([first, second]));
    await flush();
    expect(useChatStore.getState().conversation!.chatId).toBe('4');
    expect(useChatStore.getState().conversation!.chat?.id).toBe('4');
    s.stop();
  });

  it('novas conversas entram na fila pela caixa de entrada e a lista é revalidada', async () => {
    const s = useChatStore.getState();
    s.start();
    await settle(s.loadList('queue'));
    expect(useChatStore.getState().lists.queue.items).toHaveLength(2);
    await flush(46_000);
    await flush(1000);
    expect(useChatStore.getState().lists.queue.items.length).toBeGreaterThan(2);
    s.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
