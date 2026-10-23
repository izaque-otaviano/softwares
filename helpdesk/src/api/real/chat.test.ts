import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import chats from './__fixtures__/chat-chats.json';
import config from './__fixtures__/chat-config.json';
import messages from './__fixtures__/chat-messages.json';
import reasons from './__fixtures__/chat-close-reasons.json';
import { ApiError } from '../errors';
import * as chat from './chat';

interface Call {
  method: string;
  url: URL;
  body: any;
  headers: Record<string, string>;
}
let calls: Call[];
let responder: (c: Call) => { status?: number; body?: unknown; raw?: BodyInit; headers?: Record<string, string> };

beforeEach(() => {
  calls = [];
  responder = () => ({ body: {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input, 'http://localhost');
      const raw = init.body;
      const call: Call = { method: init.method ?? 'GET', url, body: raw instanceof FormData ? raw : raw ? JSON.parse(String(raw)) : undefined, headers: (init.headers ?? {}) as Record<string, string> };
      calls.push(call);
      const r = responder(call);
      const status = r.status ?? 200;
      return new Response(r.raw ?? (r.body === undefined ? null : JSON.stringify(r.body)), { status, headers: r.headers });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const page = (results: unknown[], count = results.length) => ({ count, next: null, previous: null, results });
const chatDto = chats.results[1];

describe('listagem', () => {
  it('Fila: status=queued, mais antigo primeiro (posição 1 no topo)', async () => {
    responder = () => ({
      body: page([
        { ...chatDto, id: 9, status: 'queued', queue_position: { position: 2, ahead: 1, estimated_wait_minutes: 4, queue_open: true, queue_opens_at: null } },
        { ...chatDto, id: 8, status: 'queued', queue_position: { position: 1, ahead: 0, estimated_wait_minutes: 2, queue_open: true, queue_opens_at: null } },
      ]),
    });
    const res = await chat.listChats({ scope: 'queue', q: ' Beto ' });
    expect(calls[0]!.url.pathname).toBe('/api/v1/chat/chats/');
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ limit: '50', status: 'queued', q: 'Beto' });
    expect(res.results.map((c) => c.id)).toEqual(['8', '9']);
    expect(res.count).toBe(2);
  });

  it('Minhas: mine=1 e status=active; histórico do cliente usa client=', async () => {
    responder = () => ({ body: page([]) });
    await chat.listChats({ scope: 'mine' });
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toMatchObject({ mine: '1', status: 'active' });
    await chat.listChats({ scope: 'all', clientId: '6', limit: 20, offset: 40 });
    expect(Object.fromEntries(calls[1]!.url.searchParams)).toEqual({ limit: '20', offset: '40', client: '6' });
  });

  it('contadores das três abas', async () => {
    responder = (c) => ({ body: page([], c.url.searchParams.get('status') === 'queued' ? 3 : c.url.searchParams.get('mine') ? 2 : 9) });
    expect(await chat.getChatCounts()).toEqual({ queue: 3, mine: 2, all: 9 });
  });

  it('403 e 500 viram ApiError em português', async () => {
    responder = () => ({ status: 403, body: { detail: 'Sem acesso.' } });
    await expect(chat.listChats({ scope: 'all' })).rejects.toMatchObject({ status: 403, message: expect.stringContaining('permissão') });
    responder = () => ({ status: 500, raw: '<html>erro</html>' });
    await expect(chat.getChat('1')).rejects.toBeInstanceOf(ApiError);
  });

  it('detalhe 404', async () => {
    responder = () => ({ status: 404, body: { detail: 'Não encontrado.' } });
    await expect(chat.getChat('999')).rejects.toMatchObject({ status: 404 });
  });
});

describe('mensagens', () => {
  it('carrega recortes (limit, before, after) e mapeia', async () => {
    responder = () => ({ body: (messages as any)['2'] });
    const list = await chat.listMessages('2', { limit: 60, before: '10' });
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ limit: '60', before: '10' });
    expect(list.length).toBeGreaterThan(1);
    expect(list[0]!.id).toBe('4');
    await chat.listMessages('2', { after: '7' });
    expect(Object.fromEntries(calls[1]!.url.searchParams)).toEqual({ after: '7' });
  });

  it('anexo sobe como multipart com texto, citação e nota interna', async () => {
    responder = () => ({ status: 201, body: { ...(messages as any)['2'][0], id: 50, files: [{ id: 3, filename: 'a.txt', content_type: 'text/plain', size_bytes: 1, scan_status: 'pending', url: '/api/v1/chat/files/3/', is_downloadable: false }] } });
    const m = await chat.sendFiles('2', { body: 'olhe', files: [new File(['x'], 'a.txt', { type: 'text/plain' })], replyToId: '4', internalNote: true });
    const form = calls[0]!.body as FormData;
    expect(calls[0]!.url.pathname).toBe('/api/v1/chat/chats/2/files/');
    expect(form.get('body')).toBe('olhe');
    expect(form.get('reply_to')).toBe('4');
    expect(form.get('is_internal_note')).toBe('true');
    expect((form.getAll('files')[0] as File).name).toBe('a.txt');
    expect(m.files[0]).toMatchObject({ name: 'a.txt', scanStatus: 'pending', downloadable: false });
  });

  it('anexo recusado (400) mostra a mensagem do servidor', async () => {
    responder = () => ({ status: 400, body: { files: ['Arquivo grande demais.'] } });
    await expect(chat.sendFiles('2', { body: '', files: [new File(['x'], 'a.exe')] })).rejects.toMatchObject({ status: 400, message: 'Arquivo grande demais.' });
  });

  it('editar e apagar usam a rota da mensagem', async () => {
    responder = () => ({ body: (messages as any)['2'][1] });
    await chat.editMessage('2', '5', 'novo');
    await chat.deleteMessage('2', '5');
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual(['PATCH /api/v1/chat/chats/2/messages/5/', 'DELETE /api/v1/chat/chats/2/messages/5/']);
    expect(calls[0]!.body).toEqual({ body: 'novo' });
  });

  it('marcar como lido', async () => {
    responder = () => ({ body: { marked_read: 2 } });
    await chat.markRead('2');
    expect(calls[0]).toMatchObject({ method: 'POST' });
    expect(calls[0]!.url.pathname).toBe('/api/v1/chat/chats/2/read/');
  });
});

describe('ciclo de vida', () => {
  beforeEach(() => {
    responder = () => ({ body: chatDto });
  });

  it('pegar, entrar, sair e assumir', async () => {
    await chat.takeChat('2');
    await chat.joinChat('2');
    await chat.leaveChat('2');
    await chat.assumeChat('2');
    expect(calls.map((c) => c.url.pathname.replace('/api/v1/chat/chats/2/', ''))).toEqual(['take/', 'join/', 'leave/', 'assume/']);
    expect(calls.every((c) => c.method === 'POST')).toBe(true);
  });

  it('pegar com limite estourado devolve a mensagem do backend (400)', async () => {
    responder = () => ({ status: 400, body: { detail: 'Você já está no limite de 3 chats simultâneos.' } });
    await expect(chat.takeChat('2')).rejects.toMatchObject({ status: 400, message: 'Você já está no limite de 3 chats simultâneos.' });
  });

  it('transferir manda agent_id numérico e a observação', async () => {
    await chat.transferChat('2', '3', 'cliente quer fatura');
    expect(calls[0]!.body).toEqual({ agent_id: 3, note: 'cliente quer fatura' });
  });

  it('encerrar manda motivo, observação e nota; sem motivo não manda reason_id', async () => {
    await chat.closeChat('2', { reasonId: '6', note: 'x', agentScore: 8 });
    await chat.closeChat('2');
    expect(calls[0]!.body).toEqual({ note: 'x', reason_id: 6, agent_score: 8 });
    expect(calls[1]!.body).toEqual({ note: '' });
  });

  it('encerrar motivo que exige observação (400)', async () => {
    responder = () => ({ status: 400, body: { detail: 'O motivo "Outro" pede uma observação interna.' } });
    await expect(chat.closeChat('2', { reasonId: '6' })).rejects.toMatchObject({ message: expect.stringContaining('observação') });
  });

  it('reabrir, converter e aplicar macro', async () => {
    await chat.reopenChat('2', 'cliente voltou');
    await chat.convertChat('2', '4');
    await chat.applyMacro('2', '1');
    expect(calls.map((c) => c.body)).toEqual([{ note: 'cliente voltou' }, { team_id: 4 }, { macro_id: 1 }]);
  });

  it('exportar: baixa o PDF com Accept aceito pelo backend e lê o nome do arquivo', async () => {
    responder = () => ({ raw: '%PDF-1.4', headers: { 'Content-Disposition': 'attachment; filename="atendimento-2.pdf"' } });
    const out = await chat.exportChat('2', true);
    expect(calls[0]!.url.search).toBe('?notes=1');
    expect(out.fileName).toBe('atendimento-2.pdf');
    expect(out.blob.size).toBeGreaterThan(0);
    responder = () => ({ status: 403, body: { detail: 'x' } });
    await expect(chat.exportChat('2', false)).rejects.toMatchObject({ status: 403 });
  });
});

describe('cadastros', () => {
  it('motivos: lista, cria e edita com os nomes do backend', async () => {
    responder = () => ({ body: reasons });
    expect((await chat.listCloseReasons())[0]!.name).toBe('Resolvido');
    responder = () => ({ status: 201, body: { id: 9, name: 'AG-chat', slug: 'ag-chat', requires_note: true, is_active: true, order: 3 } });
    const saved = await chat.saveCloseReason({ name: ' AG-chat ', requiresNote: true, active: true });
    expect(calls.at(-1)!.body).toEqual({ name: 'AG-chat', requires_note: true, is_active: true });
    expect(saved.requiresNote).toBe(true);
    await chat.saveCloseReason({ id: '9', name: 'AG-chat', requiresNote: false, active: false });
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH' });
  });

  it('apagar motivo em uso: 4xx do backend chega como erro', async () => {
    responder = () => ({ status: 409, body: { detail: 'Motivo em uso.' } });
    await expect(chat.deleteCloseReason('1')).rejects.toMatchObject({ status: 409 });
  });

  it('respostas rápidas: nomes em português do backend (rotulo/texto/contexto)', async () => {
    responder = () => ({ status: 201, body: { id: 12, contexto: 'chat', rotulo: 'AG', texto: 'oi', is_active: true, order: 0 } });
    await chat.saveQuickReply({ context: 'chat', label: ' AG ', text: 'oi', active: true });
    expect(calls[0]!.body).toEqual({ contexto: 'chat', rotulo: 'AG', texto: 'oi', is_active: true });
  });

  it('palavra bloqueada duplicada devolve erro de campo; administrador exigido (403)', async () => {
    responder = () => ({ status: 400, body: { word: ['Esta palavra já está na lista.'] } });
    await expect(chat.addBannedWord('droga')).rejects.toMatchObject({ fieldErrors: { word: ['Esta palavra já está na lista.'] } });
    responder = () => ({ status: 403, body: { detail: 'Apenas administradores podem alterar esta configuração.' } });
    await expect(chat.deleteBannedWord('1')).rejects.toMatchObject({ status: 403 });
  });

  it('configuração: lê e grava por PUT parcial', async () => {
    responder = () => ({ body: config });
    expect((await chat.getChatConfig()).maxChatsPerAgent).toBe(3);
    await chat.saveChatConfig({ welcomeMessage: 'oi', queueTimeoutMinutes: 5, maxChatsPerAgent: 2, scoreMin: 0, scoreMax: 10, lowScoreThreshold: 5, defaultTeamId: null, inactivityWarningMinutes: 0, inactivityCloseMinutes: 0 });
    expect(calls.at(-1)).toMatchObject({ method: 'PUT' });
    expect(calls.at(-1)!.body).toMatchObject({ welcome_message: 'oi', default_team: null, queue_timeout_minutes: 5 });
    responder = () => ({ status: 400, body: { score_max: ['O máximo da escala precisa ser maior que o mínimo.'] } });
    await expect(chat.saveChatConfig({ welcomeMessage: 'x', queueTimeoutMinutes: 1, maxChatsPerAgent: 1, scoreMin: 5, scoreMax: 5, lowScoreThreshold: 5, defaultTeamId: null, inactivityWarningMinutes: 0, inactivityCloseMinutes: 0 })).rejects.toMatchObject({ fieldErrors: { score_max: [expect.any(String)] } });
  });
});
