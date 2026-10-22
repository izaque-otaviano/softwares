import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import companies from './__fixtures__/companies.json';
import roster from './__fixtures__/teams-roster.json';
import statusesFx from './__fixtures__/statuses.json';
import ticket2 from './__fixtures__/ticket-2.json';
import ticket3 from './__fixtures__/ticket-3.json';
import ticket5 from './__fixtures__/ticket-5.json';
import usersClient from './__fixtures__/users-client.json';
import usersInternal from './__fixtures__/users-internal.json';
import macrosFx from './__fixtures__/macros.json';
import { ApiError, PartialUpdateError } from '../errors';
import * as auth from './auth';
import { resetLocalLayers } from './local';
import { resetRealCache } from './refs';
import * as realMacros from './macros';
import * as realMembers from './members';
import * as realMeta from './meta';
import * as realOrgs from './orgs';
import * as realTickets from './tickets';
import * as realUsers from './users';

/**
 * ESCRITA REAL com `fetch` simulado por um "backend" em memória com as regras observadas no Resolv de verdade:
 * `reply` exige `new_status` do agente, fechar exige a janela da solução (criação <= início <= fim <= agora, no
 * minuto), `bulk-status` recusa ticket fechado e stage de categoria `closed`, etiqueta nova só administrador, etc.
 */
type Json = Record<string, any>;
interface Call {
  method: string;
  path: string;
  body: Json | FormData | undefined;
}

const NOW = new Date('2026-10-22T15:00:30Z');
let calls: Call[] = [];
let tickets: Map<number, Json>;
let tags: Json[];
let statuses: Json[];
let overrides: ((c: Call) => { status: number; body: Json } | undefined)[] = [];
let permissions = ['settings.manage'];
let nextMsg = 100;

const clone = <T,>(x: T): T => structuredClone(x);
const fac = (category: string) => statuses.find((s) => s.is_system && s.category === category)!;
const bodyOf = (b: Json | FormData | undefined): Json => (b instanceof FormData ? Object.fromEntries([...b.entries()].filter(([k]) => k !== 'files')) : (b ?? {}));

function setStage(t: Json, stage: Json) {
  t.stage = stage.id;
  t.stage_name = stage.name;
  t.status = stage.category;
}
function event(t: Json, from: string | null, to: string | null, note = '') {
  t.events.push({ id: t.events.length + 50, from_status: from, to_status: to, actor_name: 'Alice Admin', is_reopen: false, is_automatic: false, note, created_at: NOW.toISOString() });
}

function route(method: string, path: string, body: Json | FormData | undefined): { status: number; body: any } {
  const p = path.replace('/api/v1', '');
  const b = bodyOf(body);
  let m: RegExpExecArray | null;
  if ((m = /^\/tickets\/(\d+)\/$/.exec(p))) {
    const t = tickets.get(Number(m[1]));
    if (!t) return { status: 404, body: { detail: 'Não encontrado.' } };
    if (method === 'GET') return { status: 200, body: clone(t) };
    if (method === 'PATCH') {
      if ('priority' in b) t.priority = b.priority;
      if ('team' in b) t.team = { ...t.team, id: b.team };
      if ('assignee' in b) t.assignee_id = b.assignee;
      if ('tags' in b) t.tags = (b.tags as number[]).map((id) => tags.find((x) => x.id === id)!);
      return { status: 200, body: clone(t) };
    }
  }
  if ((m = /^\/tickets\/(\d+)\/(reply|close|follow|unfollow|apply-macro)\/$/.exec(p))) {
    const t = tickets.get(Number(m[1]))!;
    const action = m[2];
    if (action === 'follow') t.watchers = [{ id: 1, name: 'Alice Admin' }];
    if (action === 'unfollow') t.watchers = [];
    if (action === 'apply-macro') {
      event(t, t.status, t.status, 'aplicou macro');
    }
    if (action === 'close' || (action === 'reply' && b.new_status === 'closed')) {
      const created = Math.floor(Date.parse(t.created_at) / 60000) * 60000;
      const started = Date.parse(b.resolution_started_at ?? b.resolution_ended_at ?? '');
      const ended = Date.parse(b.resolution_ended_at ?? '');
      if (!started || !ended) return { status: 400, body: { detail: 'Fechar exige data de início e de término da solução (D4).' } };
      if (started < created) return { status: 400, body: { detail: 'Início da solução anterior à criação do ticket.' } };
      if (ended < started) return { status: 400, body: { detail: 'Término da solução anterior ao início.' } };
      if (ended > NOW.getTime() + 60000) return { status: 400, body: { detail: 'Término da solução no futuro.' } };
      if (t.status === 'closed') return { status: 400, body: { detail: 'Ticket já está fechado.' } };
    }
    if (action === 'reply') {
      const isPublic = b.is_public !== false && b.is_public !== 'false';
      if (isPublic && !['open', 'pending_customer', 'closed'].includes(b.new_status)) return { status: 400, body: { detail: 'Ao responder, o agente escolhe o novo status: open, pending_customer ou closed.' } };
      if (!String(b.body ?? '').trim()) return { status: 400, body: { body: ['Este campo pode não estar em branco.'] } };
      t.messages.push({ id: nextMsg++, author_name: 'Alice Admin', author_avatar: null, author_is_internal: true, body: b.body, is_public: isPublic, source: 'web', created_at: NOW.toISOString(), attachments: [], mentions: [], edited_at: null, is_deleted: false });
      if (isPublic) {
        if (t.status !== b.new_status) setStage(t, fac(b.new_status));
      }
    }
    if (action === 'close' || (action === 'reply' && b.new_status === 'closed' && (b.is_public !== false && b.is_public !== 'false'))) {
      const from = t.status;
      setStage(t, fac('closed'));
      event(t, from, 'closed', b.note ?? b.close_note ?? '');
    }
    return { status: action === 'reply' ? 201 : 200, body: clone(t) };
  }
  if (p === '/tickets/bulk-status/') {
    const stage = statuses.find((s) => s.id === b.stage_id);
    if (!stage) return { status: 400, body: { stage_id: 'Status não encontrado.' } };
    if (stage.category === 'closed') return { status: 400, body: { stage_id: 'Para encerrar, use Encerrar: fechar pede as datas da solução.' } };
    const out: Json = { updated: [], failed: [] };
    for (const id of b.ticket_ids as number[]) {
      const t = tickets.get(id)!;
      if (t.status === 'closed') out.failed.push({ id, detail: 'Ticket fechado. Para reabrir, responda no próprio ticket.' });
      else if (t.stage === stage.id) out.failed.push({ id, detail: 'Já está neste status.' });
      else {
        setStage(t, stage);
        out.updated.push(id);
      }
    }
    return { status: 200, body: out };
  }
  if (p === '/tickets/bulk-assign/' || p === '/tickets/bulk-priority/') {
    for (const id of b.ticket_ids as number[]) {
      const t = tickets.get(id)!;
      if (p.includes('assign')) t.assignee_id = b.assignee_id;
      else t.priority = b.priority;
    }
    return { status: 200, body: { updated: b.ticket_ids, failed: [] } };
  }
  if (method === 'POST' && p === '/tickets/') {
    if (!b.team_id || !b.body) return { status: 400, body: { team_id: ['Este campo é obrigatório.'] } };
    const id = 100 + tickets.size;
    const t = clone(ticket3) as Json;
    Object.assign(t, { id, reference: `TD-${id}`, subject: b.subject, priority: b.priority ?? 'normal', created_at: NOW.toISOString(), messages: [{ ...t.messages[0], id: nextMsg++, body: b.body, is_public: true }], events: [], watchers: [], tags: [], assignee_id: null, requester: { id: Number(b.requester_id), name: 'Ana Almeida', email: 'ana@acme.test' } });
    t.team = { ...t.team, id: Number(b.team_id) };
    setStage(t, fac('new'));
    event(t, null, 'new');
    tickets.set(id, t);
    return { status: 201, body: clone(t) };
  }
  // administração
  if (p === '/settings/statuses/') {
    if (method === 'GET') return { status: 200, body: { count: statuses.length, next: null, previous: null, results: statuses } };
    const s = { id: 50 + statuses.length, name: b.name, slug: 's', category: b.category, category_label: '', color: b.color, order: 9, is_system: false, is_active: true };
    statuses.push(s);
    return { status: 201, body: s };
  }
  if ((m = /^\/settings\/statuses\/(\d+)\/$/.exec(p))) {
    const s = statuses.find((x) => x.id === Number(m![1]))!;
    Object.assign(s, b);
    return { status: 200, body: s };
  }
  if (p === '/settings/tags/') {
    if (method === 'GET') return { status: 200, body: { count: tags.length, next: null, previous: null, results: tags } };
    if (!permissions.includes('settings.manage')) return { status: 403, body: { detail: 'Apenas administradores podem alterar esta configuração.' } };
    const t = { id: 10 + tags.length, name: b.name, slug: b.name, color: '#888888' };
    tags.push(t);
    return { status: 201, body: t };
  }
  if (p === '/settings/ticket-macros/' && method === 'POST') return { status: 201, body: { id: 77, name: b.name, body: b.body, priority: b.priority, tags: b.tags, is_active: b.is_active, order: 0 } };
  if ((m = /^\/settings\/ticket-macros\/(\d+)\/$/.exec(p))) {
    if (method === 'DELETE') return { status: 204, body: undefined };
    return { status: 200, body: { ...macrosFx.results[0], ...b, id: Number(m[1]) } };
  }
  if (p === '/settings/ticket-macros/') return { status: 200, body: macrosFx };
  if (p === '/settings/teams/roster/') return { status: 200, body: roster };
  if (p === '/settings/users/' && method === 'POST') return { status: 201, body: { id: 90, email: b.email, full_name: b.full_name, kind: b.kind, internal_role: b.internal_role ?? null, company: b.company ?? null, phone: b.phone ?? '', is_active: true, invite_status: 'pendente', team_ids: [] } };
  if (p === '/settings/users/') return { status: 200, body: p && method === 'GET' ? { count: 0, next: null, previous: null, results: [] } : {} };
  if ((m = /^\/settings\/teams\/(\d+)\/agents\/$/.exec(p))) return { status: 201, body: { id: 91, email: b.email, full_name: b.full_name, kind: 'internal', internal_role: b.internal_role, is_active: true, invite_status: 'pendente', team_ids: [Number(m[1])] } };
  if ((m = /^\/settings\/users\/(\d+)\/$/.exec(p))) {
    const u = [...usersClient.results, ...usersInternal.results].find((x) => x.id === Number(m![1]))!;
    return { status: 200, body: { ...u, ...b } };
  }
  if (p === '/settings/companies/' && method === 'POST') return { status: 201, body: { id: 60, name: b.name, slug: b.slug, plan: b.plan, plan_name: 'Black', is_active: true, domains: b.domains, notes: b.notes } };
  if (p === '/settings/companies/') return { status: 200, body: companies };
  if ((m = /^\/settings\/companies\/(\d+)\/$/.exec(p))) {
    if (method === 'DELETE') return { status: 204, body: undefined };
    return { status: 200, body: { ...companies.results[0], ...b, id: Number(m[1]) } };
  }
  if (p === '/settings/plans/') return { status: 200, body: { count: 1, next: null, previous: null, results: [{ id: 1, slug: 'black', name: 'Black', is_active: true, rank: 30 }] } };
  if (p === '/ticket-views/') return { status: 200, body: [] };
  return { status: 404, body: { detail: `sem rota ${method} ${p}` } };
}

beforeEach(() => {
  calls = [];
  overrides = [];
  permissions = ['settings.manage'];
  nextMsg = 100;
  tickets = new Map([[2, clone(ticket2) as Json], [3, clone(ticket3) as Json], [5, clone(ticket5) as Json]]);
  tags = [{ id: 1, name: 'vip', slug: 'vip', color: '#f00' }];
  statuses = [...clone(statusesFx.results), { id: 9, name: 'Em andamento', slug: 'em-andamento', category: 'open', category_label: 'Aberto', color: '#2E7D32', order: 4, is_system: false, is_active: true }] as Json[];
  // ticket 5 reaberto com o stage "Fechado": o teste de fechado usa o 3 depois de fechar
  resetRealCache();
  resetLocalLayers();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://127.0.0.1');
      const body = init?.body instanceof FormData ? init.body : init?.body ? (JSON.parse(String(init.body)) as Json) : undefined;
      const call: Call = { method: init?.method ?? 'GET', path: u.pathname, body };
      if (call.method !== 'GET') calls.push(call);
      const forced = overrides.map((o) => o(call)).find(Boolean);
      const res = forced ?? route(call.method, u.pathname, body);
      return new Response(res.status === 204 ? null : JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const writes = () => calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path.replace('/api/v1', '')}`);
const comment = (html: string, isPublic = true, files?: File[]) => ({ authorId: '1', public: isPublic, bodyHtml: html, files });

describe('updateTicket (real): ordem segura e markdown', () => {
  it('propriedades -> mensagem pública (HTML vira markdown, new_status da categoria) -> status personalizado', async () => {
    const out = await realTickets.updateTicket(2, { priority: 'urgent', assigneeId: '1', tags: ['vip'], statusId: '9' }, comment('<p><strong>Oi</strong> tudo bem?</p><ul><li><p>a</p></li></ul>'));
    expect(writes()).toEqual(['PATCH /tickets/2/', 'POST /tickets/2/reply/', 'POST /tickets/bulk-status/']);
    expect(calls[0]!.body).toEqual({ priority: 'urgent', assignee: 1, tags: [1] });
    expect(calls[1]!.body).toMatchObject({ body: '**Oi** tudo bem?\n\n- a', is_public: true, new_status: 'open' });
    expect(calls[2]!.body).toEqual({ ticket_ids: [2], stage_id: 9 });
    expect(out).toMatchObject({ statusId: '9', priority: 'urgent', assigneeId: '1' });
  });

  it('só o status (sem texto): categoria aberta/pendente vai por bulk-status', async () => {
    await realTickets.updateTicket(2, { statusId: '3' });
    expect(writes()).toEqual(['POST /tickets/bulk-status/']);
    expect(calls[0]!.body).toEqual({ ticket_ids: [2], stage_id: 3 });
  });

  it('nota interna não leva new_status e não muda o status', async () => {
    await realTickets.updateTicket(2, {}, comment('<p>só nós</p>', false));
    expect(writes()).toEqual(['POST /tickets/2/reply/']);
    expect(calls[0]!.body).toMatchObject({ body: 'só nós', is_public: false });
    expect(bodyOf(calls[0]!.body)).not.toHaveProperty('new_status');
  });

  it('resposta pública sem trocar status mantém a categoria atual (aberto continua aberto)', async () => {
    await realTickets.updateTicket(2, {}, comment('<p>oi</p>'));
    expect(calls[0]!.body).toMatchObject({ new_status: 'open' });
    expect(writes()).toEqual(['POST /tickets/2/reply/']);
  });

  it('anexos viajam em multipart (campo `files`) junto da resposta', async () => {
    const file = new File(['olá'], 'nota.txt', { type: 'text/plain' });
    await realTickets.updateTicket(2, {}, comment('<p>veja</p>', true, [file]));
    const fd = calls[0]!.body as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('body')).toBe('veja');
    expect(fd.get('new_status')).toBe('open');
    expect((fd.getAll('files')[0] as File).name).toBe('nota.txt');
  });

  it('seguir e deixar de seguir só o próprio usuário; outros seguidores ficam locais', async () => {
    vi.spyOn(auth, 'getRealMeId').mockReturnValue('1');
    const a = await realTickets.updateTicket(2, { followerIds: ['1', '4'] });
    expect(writes()).toEqual(['POST /tickets/2/follow/']);
    expect(a.localFields).toEqual(['followerIds']);
    expect(a.followerIds).toEqual(['1', '4']);
    calls = [];
    await realTickets.updateTicket(2, { followerIds: [] });
    expect(writes()).toEqual(['POST /tickets/2/unfollow/']);
  });

  it('campos que o backend não tem (assunto, tipo, CC) ficam só no navegador e avisam em localFields', async () => {
    const out = await realTickets.updateTicket(2, { subject: 'Outro assunto', type: 'incident', ccIds: ['x@y.z'] });
    expect(writes()).toEqual([]);
    expect(out).toMatchObject({ subject: 'Outro assunto', type: 'incident', localFields: ['subject', 'type', 'ccIds'] });
    resetRealCache();
    expect((await realTickets.getTicket(2)).subject).toBe('Outro assunto');
  });

  it('macros usadas no formulário chamam apply-macro antes das propriedades', async () => {
    await realTickets.updateTicket(2, { priority: 'high' }, undefined, { macroIds: ['3'] });
    expect(writes()).toEqual(['POST /tickets/2/apply-macro/', 'PATCH /tickets/2/']);
    expect(calls[0]!.body).toEqual({ macro_id: 3 });
  });
});

describe('updateTicket (real): fechar e reabrir', () => {
  it('fechar sem texto usa close/ com janela: início = 1ª transição para Aberto do ciclo, fim = agora no minuto', async () => {
    await realTickets.updateTicket(2, { statusId: '4' });
    expect(writes()).toEqual(['POST /tickets/2/close/']);
    const b = calls[0]!.body as Json;
    expect(b.resolution_ended_at).toBe('2026-10-22T15:00:00.000Z');
    expect(b.resolution_started_at).toBe('2026-10-22T14:09:00.000Z'); // 11:09:41-03:00 = 14:09 UTC (new -> open)
    expect(b.note).toBe('');
  });

  it('responder e fechar numa chamada só leva as datas e o new_status closed', async () => {
    await realTickets.updateTicket(2, { statusId: '4' }, comment('<p>resolvido</p>'));
    expect(writes()).toEqual(['POST /tickets/2/reply/']);
    expect(calls[0]!.body).toMatchObject({ new_status: 'closed', resolution_ended_at: '2026-10-22T15:00:00.000Z' });
    expect((await realTickets.getTicket(2)).statusId).toBe('4');
  });

  it('reabrir ticket fechado SEM mensagem é recusado antes de qualquer escrita', async () => {
    await realTickets.updateTicket(2, { statusId: '4' });
    calls = [];
    await expect(realTickets.updateTicket(2, { statusId: '2' })).rejects.toThrow(/só uma resposta pública reabre/);
    expect(writes()).toEqual([]);
  });

  it('resposta pública em ticket fechado reabre (new_status open)', async () => {
    await realTickets.updateTicket(2, { statusId: '4' });
    calls = [];
    await realTickets.updateTicket(2, {}, comment('<p>voltei</p>'));
    expect(calls[0]!.body).toMatchObject({ new_status: 'open' });
  });
});

describe('updateTicket (real): erros e falha parcial', () => {
  it('400 de regra de negócio num passo único vira ApiError com a mensagem do backend', async () => {
    overrides.push((c) => (c.path.endsWith('/reply/') ? { status: 400, body: { detail: 'Regra de negócio.' } } : undefined));
    const e = await realTickets.updateTicket(2, {}, comment('<p>x</p>')).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).not.toBeInstanceOf(PartialUpdateError);
    expect(e.message).toBe('Regra de negócio.');
    expect(e.status).toBe(400);
  });

  it('403 vira a frase de permissão com o motivo do backend', async () => {
    overrides.push((c) => (c.method === 'PATCH' ? { status: 403, body: { detail: 'Seu papel não permite editar propriedades.' } } : undefined));
    const e = await realTickets.updateTicket(2, { priority: 'low' }).catch((x) => x);
    expect(e.status).toBe(403);
    expect(e.message).toBe('Você não tem permissão para esta ação. Seu papel não permite editar propriedades.');
  });

  it('PARCIAL: propriedades aplicadas, mensagem falha -> relato exato e nada duplicado ao repetir', async () => {
    let failReply = true;
    overrides.push((c) => (failReply && c.path.endsWith('/reply/') ? { status: 400, body: { detail: 'Texto recusado.' } } : undefined));
    const patch = { priority: 'high' as const, tags: ['vip'] };
    const e: PartialUpdateError = await realTickets.updateTicket(2, patch, comment('<p>olá</p>')).catch((x) => x);
    expect(e).toBeInstanceOf(PartialUpdateError);
    expect(e.message).toBe('Aplicado: prioridade, etiquetas. Não aplicado: mensagem. Motivo: Texto recusado.');
    expect(e.appliedKeys).toEqual(['priority', 'tags']);
    expect(e.pendingKeys).toEqual([]);
    expect(e.commentSent).toBe(false);
    expect((e.ticket as { priority: string }).priority).toBe('high');
    expect(writes()).toEqual(['PATCH /tickets/2/', 'POST /tickets/2/reply/']);

    // "Tentar novamente": o formulário já tratou prioridade/etiquetas como aplicadas; só a mensagem sai.
    failReply = false;
    calls = [];
    await realTickets.updateTicket(2, {}, comment('<p>olá</p>'));
    expect(writes()).toEqual(['POST /tickets/2/reply/']);
    expect(tickets.get(2)!.messages.filter((m: Json) => m.body === 'olá')).toHaveLength(1);
  });

  it('PARCIAL: mensagem gravada, estágio personalizado falha -> commentSent e só o estágio fica pendente', async () => {
    overrides.push((c) => (c.path === '/api/v1/tickets/bulk-status/' ? { status: 500, body: { detail: 'Erro interno.' } } : undefined));
    const e: PartialUpdateError = await realTickets.updateTicket(2, { statusId: '9' }, comment('<p>fui</p>')).catch((x) => x);
    expect(e).toBeInstanceOf(PartialUpdateError);
    expect(e.message).toBe('Aplicado: mensagem. Não aplicado: status. Motivo: Erro interno.');
    expect(e.commentSent).toBe(true);
    expect(e.pendingKeys).toEqual(['statusId']);
    overrides = [];
    calls = [];
    await realTickets.updateTicket(2, { statusId: '9' });
    expect(writes()).toEqual(['POST /tickets/bulk-status/']);
  });

  it('sem resposta do servidor (5xx) na mensagem: confere antes de deixar repetir e NÃO duplica', async () => {
    overrides.push((c) => {
      if (!c.path.endsWith('/reply/')) return undefined;
      route(c.method, c.path, c.body); // o backend gravou...
      return { status: 502, body: { detail: 'Bad gateway' } }; // ...mas a resposta se perdeu
    });
    const out = await realTickets.updateTicket(2, {}, comment('<p>uma vez só</p>'));
    expect(out.comments.filter((m) => m.bodyHtml.includes('uma vez só'))).toHaveLength(1);
  });

  it('etiqueta inexistente: administrador cria; agente sem permissão é recusado ANTES de qualquer escrita', async () => {
    await realTickets.updateTicket(2, { tags: ['novidade'] });
    expect(writes()).toEqual(['POST /settings/tags/', 'PATCH /tickets/2/']);
    expect(tags.map((t) => t.name)).toContain('novidade');

    calls = [];
    permissions = [];
    vi.spyOn(auth, 'hasRealPermission').mockReturnValue(false);
    await expect(realTickets.updateTicket(2, { priority: 'low', tags: ['outra'] }, comment('<p>x</p>'))).rejects.toThrow(/só administradores podem criar etiquetas/);
    expect(writes()).toEqual([]);
  });
});

describe('createTicket (real)', () => {
  it('POST /tickets/ com markdown, depois responsável, etiquetas e status em chamadas separadas', async () => {
    const t = await realTickets.createTicket({
      subject: ' Meu assunto ',
      requesterId: '5',
      bodyHtml: '<p><em>oi</em></p>',
      assigneeGroupId: '1',
      assigneeId: '3',
      tags: ['vip'],
      statusId: '2',
      priority: 'high',
    });
    expect(writes()).toEqual(['POST /tickets/', 'PATCH /tickets/103/', 'POST /tickets/bulk-status/']);
    expect(calls[0]!.body).toMatchObject({ team_id: 1, subject: 'Meu assunto', body: '_oi_', requester_id: 5, priority: 'high' });
    expect(calls[1]!.body).toEqual({ assignee: 3, tags: [1] });
    expect(t).toMatchObject({ id: 103, statusId: '2', assigneeId: '3', subject: 'Meu assunto' });
  });

  it('falha depois de criar: PartialUpdateError{created} com o ticket real (repetir atualiza, não cria outro)', async () => {
    overrides.push((c) => (c.method === 'PATCH' ? { status: 400, body: { assignee: ['Agente não encontrado.'] } } : undefined));
    const e: PartialUpdateError = await realTickets.createTicket({ subject: 'S', requesterId: '5', bodyHtml: '<p>x</p>', assigneeGroupId: '1', assigneeId: '99' }).catch((x) => x);
    expect(e).toBeInstanceOf(PartialUpdateError);
    expect(e.created).toBe(true);
    expect(e.commentSent).toBe(false);
    expect((e.ticket as { id: number }).id).toBe(103);
    expect(e.message).toMatch(/^Nada foi aplicado\. Não aplicado: responsável\./);
    expect(writes().filter((w) => w === 'POST /tickets/')).toHaveLength(1);
  });

  it('descrição como observação interna não existe no backend: recusa SEM criar (o texto iria ao cliente)', async () => {
    await expect(realTickets.createTicket({ subject: 'S', requesterId: '5', bodyHtml: '<p>segredo</p>', assigneeGroupId: '1', public: false })).rejects.toThrow(/PÚBLICA/);
    expect(writes()).toEqual([]);
  });

  it('sem grupo nem agente conhecido usa a primeira equipe; anexos viajam no POST', async () => {
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    await realTickets.createTicket({ subject: 'S', requesterId: '5', bodyHtml: '<p>x</p>', files: [file] });
    const fd = calls[0]!.body as FormData;
    expect(fd.get('team_id')).toBe('1');
    expect((fd.getAll('files')[0] as File).name).toBe('a.txt');
  });
});

describe('bulkUpdate (real)', () => {
  it('atribuir, prioridade e status usam os endpoints em lote', async () => {
    const res = await realTickets.bulkUpdate([2, 3], { assigneeId: '1', priority: 'low', statusId: '9' });
    expect(writes()).toEqual(['POST /tickets/bulk-assign/', 'POST /tickets/bulk-priority/', 'POST /tickets/bulk-status/']);
    expect(calls[0]!.body).toEqual({ ticket_ids: [2, 3], assignee_id: 1 });
    expect(res.failed).toEqual([]);
    expect(res.updated.map((t) => [t.id, t.statusId, t.priority])).toEqual([[2, '9', 'low'], [3, '9', 'low']]);
  });

  it('resolvido fecha ticket a ticket, cada um com a janela do próprio ticket', async () => {
    await realTickets.bulkUpdate([2, 3], { statusId: '4' });
    expect(writes().sort()).toEqual(['POST /tickets/2/close/', 'POST /tickets/3/close/']);
    const w2 = calls.find((c) => c.path.endsWith('/2/close/'))!.body as Json;
    const w3 = calls.find((c) => c.path.endsWith('/3/close/'))!.body as Json;
    expect([w2.resolution_started_at, w3.resolution_started_at]).toEqual(['2026-10-22T14:09:00.000Z', '2026-10-22T14:09:00.000Z']);
    expect(w3.resolution_ended_at).toBe('2026-10-22T15:00:00.000Z');
  });

  it('falhas por ticket vêm em failed[] (parcial) e o resto é alterado', async () => {
    await realTickets.updateTicket(2, { statusId: '4' });
    calls = [];
    const res = await realTickets.bulkUpdate([2, 3], { statusId: '9' });
    expect(res.failed).toEqual([{ id: 2, message: 'Ticket fechado. Para reabrir, responda no próprio ticket.' }]);
    expect(res.updated.map((t) => t.id)).toEqual([3]);
  });
});

describe('administração (real)', () => {
  it('status: cria com categoria e cor em hex; endUserName/descrição ficam locais; desativar = is_active:false', async () => {
    const created = await realMeta.saveStatus({ category: 'open', agentName: ' Triagem ', endUserName: 'Em triagem', agentDescription: 'obs', color: 'pending' });
    expect(writes()).toEqual(['POST /settings/statuses/']);
    expect(calls[0]!.body).toEqual({ name: 'Triagem', color: '#1F73B7', is_active: true, category: 'open' });
    expect(created).toMatchObject({ agentName: 'Triagem', endUserName: 'Em triagem', agentDescription: 'obs', category: 'open' });
    calls = [];
    await realMeta.saveStatus({ ...created, active: false });
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.body).toMatchObject({ is_active: false });
    expect(bodyOf(calls[0]!.body)).not.toHaveProperty('category');
    expect((await realMeta.listStatuses()).find((s) => s.id === created.id)!.endUserName).toBe('Em triagem');
  });

  it('403 do backend vira a frase de permissão e a UI recebe o erro (nada some)', async () => {
    overrides.push((c) => (c.method === 'POST' ? { status: 403, body: { detail: 'Apenas administradores podem alterar esta configuração.' } } : undefined));
    const e = await realMeta.saveStatus({ category: 'open', agentName: 'X', endUserName: 'X', agentDescription: '', color: 'open' }).catch((x) => x);
    expect(e.message).toBe('Você não tem permissão para esta ação. Apenas administradores podem alterar esta configuração.');
  });

  it('macro: HTML do editor vira markdown, tags viram ids, campos locais ficam locais', async () => {
    const saved = await realMacros.saveMacro({ name: ' Boas-vindas ', availableTo: 'group', active: true, description: 'd', actions: { publicReply: '<p>Olá <strong>{{solicitante}}</strong></p><ul><li><p>um</p></li></ul>', priority: 'high', addTags: ['vip'], internalNote: 'n' } });
    expect(writes()).toEqual(['POST /settings/ticket-macros/']);
    expect(calls[0]!.body).toEqual({ name: 'Boas-vindas', body: 'Olá **{{solicitante}}**\n\n- um', priority: 'high', tags: [1], is_active: true });
    expect(saved).toMatchObject({ id: '77', description: 'd', availableTo: 'group', actions: { priority: 'high', addTags: ['vip'], internalNote: 'n' } });
    calls = [];
    await realMacros.saveMacro({ ...saved, bodyMarkdown: 'texto **puro**' });
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.body).toMatchObject({ body: 'texto **puro**' });
    await expect(realMacros.saveMacro({ name: 'Vazia', availableTo: 'all', active: true, actions: {} })).rejects.toThrow(/texto de resposta/);
    await realMacros.deleteMacro('77');
    expect(calls.at(-1)!.method).toBe('DELETE');
  });

  it('membro: com grupo usa teams/{id}/agents/, sem grupo users/ (interno); suspender = is_active:false', async () => {
    const a = await realMembers.createMember({ name: 'Nova Pessoa', email: 'Nova@X.test', role: 'agent', groupId: '1' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/settings/teams/1/agents/' });
    expect(calls[0]!.body).toEqual({ email: 'nova@x.test', full_name: 'Nova Pessoa', internal_role: 'agent' });
    expect(a).toMatchObject({ name: 'Nova Pessoa', pending: true, groups: ['Suporte'] });
    calls = [];
    await realMembers.createMember({ name: 'Adm', email: 'adm@x.test', role: 'admin' });
    expect(calls[0]).toMatchObject({ path: '/api/v1/settings/users/' });
    expect(calls[0]!.body).toMatchObject({ kind: 'internal', internal_role: 'admin' });
    calls = [];
    const s = await realMembers.setMemberSuspended('3', true);
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/settings/users/3/' });
    expect(calls[0]!.body).toEqual({ is_active: false });
    expect(s.suspended).toBe(true);
  });

  it('empresa: cria com slug e plano; nome/domínios/observações vão ao backend, tags ficam locais; apagar desativa', async () => {
    const org = await realOrgs.createOrg({ name: 'Nova Ltda ção', domains: ['nova.test'], tags: ['x'], planId: '1' });
    expect(calls[0]!.body).toMatchObject({ name: 'Nova Ltda ção', slug: 'nova-ltda-cao', plan: 1, domains: ['nova.test'] });
    expect(org.tags).toEqual(['x']);
    calls = [];
    const up = await realOrgs.updateOrg('1', { name: 'Acme', notes: 'obs', tags: ['t'], userAccess: 'org_tickets' });
    expect(calls[0]!.body).toEqual({ name: 'Acme', notes: 'obs' });
    expect(up).toMatchObject({ tags: ['t'], userAccess: 'org_tickets' });
    calls = [];
    await realOrgs.deleteOrg('1');
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/settings/companies/1/' });
    expect((await realOrgs.listOrgs()).map((o) => o.id)).not.toContain('1');
    expect((await realOrgs.listPlans())[0]).toEqual({ id: '1', name: 'Black' });
  });

  it('cliente: exige organização e telefone ANTES de chamar; cria com kind client; suspender = is_active; apagar desativa', async () => {
    await expect(realUsers.createUser({ name: 'A', email: 'a@x.test' })).rejects.toThrow(/organização/);
    await expect(realUsers.createUser({ name: 'A', email: 'a@x.test', orgId: '1' })).rejects.toThrow(/telefone/);
    expect(writes()).toEqual([]);
    const u = await realUsers.createUser({ name: 'Cli', email: 'cli@x.test', orgId: '1', phone: '1199', tags: ['vip'] });
    expect(calls[0]!.body).toEqual({ email: 'cli@x.test', full_name: 'Cli', kind: 'client', company: 1, phone: '1199' });
    expect(u).toMatchObject({ id: '90', tags: ['vip'] });
    calls = [];
    const up = await realUsers.updateUser('5', { name: 'Ana B', suspended: true, tags: ['t'], notes: 'n' });
    expect(calls[0]!.body).toEqual({ full_name: 'Ana B', is_active: false });
    expect(up).toMatchObject({ suspended: true, tags: ['t'], notes: 'n' });
    calls = [];
    await realUsers.deleteUser('5');
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/settings/users/5/' });
  });
});
