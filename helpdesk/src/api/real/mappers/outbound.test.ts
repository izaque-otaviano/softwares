import { describe, expect, it } from 'vitest';
import statusesFx from '../__fixtures__/statuses.json';
import ticket2 from '../__fixtures__/ticket-2.json';
import ticket3 from '../__fixtures__/ticket-3.json';
import ticket5 from '../__fixtures__/ticket-5.json';
import type { TicketStatus } from '@/types/domain';
import { mapStatus } from './status';
import type { StatusDto, TicketDetailDto } from './dto';
import { createTicketBody, planNewTicket, planTicketUpdate, replyStatusFor, resolutionWindow, resolveTagIds, slugify, statusColorToHex, toFormData, validateResolutionWindow } from './outbound';

const statuses: TicketStatus[] = [
  ...(statusesFx.results as StatusDto[]).map(mapStatus),
  { id: '9', category: 'open', agentName: 'Em andamento', agentDescription: '', endUserName: 'Em andamento', color: '#2E7D32', active: true, system: false },
];
const base = { meId: '1', statuses, tags: [{ id: 1, name: 'vip' }] };
const open = { statusId: '2', followerIds: [] as string[] };

describe('resolutionWindow (fechamento: janela da solução com fixtures reais)', () => {
  const now = new Date('2026-10-22T18:30:45Z');
  it('início = primeira transição para Aberto; fim = agora no minuto', () => {
    expect(resolutionWindow(ticket2 as unknown as TicketDetailDto, now)).toEqual({ started: '2026-10-22T14:09:00.000Z', ended: '2026-10-22T18:30:00.000Z' });
  });
  it('depois de reabrir, o ciclo recomeça na reabertura (não conta o ciclo anterior)', () => {
    const w = resolutionWindow(ticket5 as unknown as TicketDetailDto, now);
    const reopen = (ticket5 as unknown as TicketDetailDto).events.find((e) => e.from_status === 'closed')!;
    expect(Date.parse(w.started)).toBe(Math.floor(Date.parse(reopen.created_at) / 60000) * 60000);
  });
  it('sem transição para Aberto, usa a criação (no minuto); nunca antes dela nem depois do fim', () => {
    const dto = { created_at: '2026-10-22T14:00:40Z', events: [] } as unknown as TicketDetailDto;
    expect(resolutionWindow(dto, now).started).toBe('2026-10-22T14:00:00.000Z');
    const future = { created_at: '2026-10-22T19:00:00Z', events: [] } as unknown as TicketDetailDto;
    const w = resolutionWindow(future, now);
    expect(Date.parse(w.ended)).toBeGreaterThanOrEqual(Date.parse(w.started));
  });
});

describe('validateResolutionWindow', () => {
  const now = new Date('2026-10-22T18:30:00Z');
  const created = '2026-10-22T14:00:00.000Z';
  it('aceita janela dentro dos limites', () => {
    expect(validateResolutionWindow({ started: '2026-10-22T15:00:00.000Z', ended: '2026-10-22T18:00:00.000Z' }, created, now)).toBeNull();
  });
  it('rejeita início antes da criação', () => {
    expect(validateResolutionWindow({ started: '2026-10-22T13:00:00.000Z', ended: '2026-10-22T18:00:00.000Z' }, created, now)).toMatch(/criação/);
  });
  it('rejeita término antes do início', () => {
    expect(validateResolutionWindow({ started: '2026-10-22T16:00:00.000Z', ended: '2026-10-22T15:00:00.000Z' }, created, now)).toMatch(/anterior ao início/);
  });
  it('rejeita término no futuro (>1 min)', () => {
    expect(validateResolutionWindow({ started: '2026-10-22T15:00:00.000Z', ended: '2026-10-22T19:00:00.000Z' }, created, now)).toMatch(/futuro/);
  });
});

describe('planTicketUpdate', () => {
  it('ordem: macro, propriedades, seguir, mensagem, estágio; locais separados', () => {
    const plan = planTicketUpdate({
      ...base,
      patch: { priority: 'high', assigneeGroupId: '2', assigneeId: '3', tags: ['vip'], followerIds: ['1', '7'], statusId: '9', subject: 'novo', type: 'task' },
      comment: { markdown: 'oi', public: true },
      current: open,
      currentStageId: '2',
      macroIds: ['5'],
    });
    expect(plan.steps.map((s) => s.kind)).toEqual(['macro', 'props', 'follow', 'reply']);
    expect(plan.steps[1]!.body).toEqual({ priority: 'high', team: 2, assignee: 3, tags: [1] });
    expect(plan.steps[3]!.body).toMatchObject({ is_public: true, new_status: 'open', stage: 9 }); // status personalizado no próprio reply
    expect(plan.local).toMatchObject({ subject: 'novo', type: 'task', followerIds: ['7'] });
    expect(plan.localKeys).toEqual(['subject', 'type', 'followerIds']);
  });
  it('desatribuir manda assignee:null; prioridade vazia não é enviada', () => {
    const plan = planTicketUpdate({ ...base, patch: { assigneeId: undefined, priority: undefined }, current: open });
    expect(plan.steps[0]!.body).toEqual({ assignee: null });
  });
  it('responder em estágio personalizado da mesma categoria NÃO volta ao estágio de fábrica (sem passo extra)', () => {
    const plan = planTicketUpdate({ ...base, patch: {}, comment: { markdown: 'x', public: true }, current: { statusId: '9', followerIds: [] }, currentStageId: '9' });
    expect(plan.steps.map((s) => s.kind)).toEqual(['reply']);
  });
  it('estágio escolhido (personalizado ou de fábrica) com resposta pública: UM reply com new_status e stage, sem bulk-status', () => {
    const toCustom = planTicketUpdate({ ...base, patch: { statusId: '9' }, comment: { markdown: 'x', public: true }, current: { statusId: '3', followerIds: [] }, currentStageId: '3' });
    expect(toCustom.steps.map((s) => s.kind)).toEqual(['reply']);
    expect(toCustom.steps[0]!.body).toMatchObject({ new_status: 'open', stage: 9 });
    const toFactory = planTicketUpdate({ ...base, patch: { statusId: '3' }, comment: { markdown: 'x', public: true }, current: open, currentStageId: '2' });
    expect(toFactory.steps.map((s) => s.kind)).toEqual(['reply']);
    expect(toFactory.steps[0]!.body).toMatchObject({ new_status: 'pending_customer', stage: 3 });
  });
  it('sem trocar o status a resposta não leva stage (o backend mantém a coluna ou cai na de fábrica ao reabrir)', () => {
    const plan = planTicketUpdate({ ...base, patch: {}, comment: { markdown: 'x', public: true }, current: { statusId: '4', followerIds: [] }, currentStageId: '4' });
    expect(plan.steps[0]!.body).toMatchObject({ new_status: 'open' });
    expect(plan.steps[0]!.body).not.toHaveProperty('stage');
  });
  it('alvo "Novo" não existe no reply (responder abre): mensagem e depois bulk-status para a coluna Novo', () => {
    const plan = planTicketUpdate({ ...base, patch: { statusId: '1' }, comment: { markdown: 'x', public: true }, current: open, currentStageId: '2' });
    expect(plan.steps.map((s) => s.kind)).toEqual(['reply', 'stage']);
    expect(plan.steps[0]!.body).toMatchObject({ new_status: 'open' });
    expect(plan.steps[0]!.body).not.toHaveProperty('stage');
  });
  it('mudar de status com nota interna ou sem mensagem ainda usa bulk-status', () => {
    expect(planTicketUpdate({ ...base, patch: { statusId: '9' }, current: { statusId: '3', followerIds: [] } }).steps.map((s) => s.kind)).toEqual(['stage']);
    expect(planTicketUpdate({ ...base, patch: { statusId: '9' }, comment: { markdown: 'n', public: false }, current: open }).steps.map((s) => s.kind)).toEqual(['reply', 'stage']);
  });
  it('resolvido: sem texto = close; com texto = reply closed com janela; nota interna + resolvido = nota e depois close', () => {
    const c = planTicketUpdate({ ...base, patch: { statusId: '4' }, current: open });
    expect(c.steps.map((s) => s.kind)).toEqual(['close']);
    expect(c.steps[0]!.body).toEqual({ stage: 4 });
    const r = planTicketUpdate({ ...base, patch: { statusId: '4' }, comment: { markdown: 'ok', public: true }, current: open });
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]).toMatchObject({ kind: 'reply', needsWindow: true });
    expect(r.steps[0]!.body).toMatchObject({ new_status: 'closed', stage: 4 });
    const n = planTicketUpdate({ ...base, patch: { statusId: '4' }, comment: { markdown: 'ok', public: false }, current: open });
    expect(n.steps.map((s) => s.kind)).toEqual(['reply', 'close']);
    expect(n.steps[0]!.body).not.toHaveProperty('new_status');
  });
  it('fechar em status personalizado da categoria fechada: stage no close/ e no reply', () => {
    const custom = { id: '12', category: 'solved' as const, agentName: 'Resolvido', agentDescription: '', endUserName: 'Resolvido', color: '#39434B', active: true, system: false };
    const all = [...statuses, custom];
    const noText = planTicketUpdate({ ...base, statuses: all, patch: { statusId: '12' }, current: open });
    expect(noText.steps).toEqual([{ kind: 'close', covers: ['statusId'], needsWindow: true, body: { stage: 12 } }]);
    const withText = planTicketUpdate({ ...base, statuses: all, patch: { statusId: '12' }, comment: { markdown: 'ok', public: true }, current: open });
    expect(withText.steps[0]!.body).toMatchObject({ new_status: 'closed', stage: 12 });
    expect(withText.steps).toHaveLength(1);
  });
  it('ticket fechado: reabrir sem mensagem pública é bloqueado; com mensagem reabre', () => {
    const closed = { statusId: '4', followerIds: [] as string[] };
    expect(planTicketUpdate({ ...base, patch: { statusId: '2' }, current: closed }).blocked).toMatch(/fechado/);
    expect(planTicketUpdate({ ...base, patch: { statusId: '2' }, comment: { markdown: 'x', public: false }, current: closed }).blocked).toMatch(/fechado/);
    const ok = planTicketUpdate({ ...base, patch: { statusId: '2' }, comment: { markdown: 'x', public: true }, current: closed, currentStageId: '4' });
    expect(ok.blocked).toBeUndefined();
    expect(ok.steps[0]!.body).toMatchObject({ new_status: 'open' });
    expect(ok.steps[0]!.body).toMatchObject({ stage: 2 }); // status escolhido explicitamente vai por stage
    const custom = planTicketUpdate({ ...base, patch: { statusId: '9' }, comment: { markdown: 'x', public: true }, current: closed, currentStageId: '4' });
    expect(custom.steps).toHaveLength(1);
    expect(custom.steps[0]!.body).toMatchObject({ new_status: 'open', stage: 9 });
  });
  it('seguir/deixar de seguir só quando o próprio usuário muda', () => {
    expect(planTicketUpdate({ ...base, patch: { followerIds: ['1'] }, current: open }).steps.map((s) => s.kind)).toEqual(['follow']);
    expect(planTicketUpdate({ ...base, patch: { followerIds: [] }, current: { statusId: '2', followerIds: ['1'] } }).steps.map((s) => s.kind)).toEqual(['unfollow']);
    expect(planTicketUpdate({ ...base, patch: { followerIds: ['1'] }, current: { statusId: '2', followerIds: ['1'] } }).steps).toEqual([]);
  });
  it('ticket novo (status Novo) respondido publicamente vira Aberto (o backend não aceita new_status=new)', () => {
    expect(replyStatusFor('new')).toBe('open');
    const plan = planTicketUpdate({ ...base, patch: {}, comment: { markdown: 'x', public: true }, current: { statusId: '1', followerIds: [] }, currentStageId: '1' });
    expect(plan.steps[0]!.body).toMatchObject({ new_status: 'open' });
  });
});

describe('planNewTicket: criar em 1 chamada', () => {
  const ctx = { statuses: [...statuses, { id: '12', category: 'solved' as const, agentName: 'Resolvido', agentDescription: '', endUserName: 'Resolvido', color: '#39434B', active: true, system: false }], tags: [{ id: 1, name: 'vip' }] };
  const form = { subject: 'S', requesterId: '5', markdown: 'm', teamId: 1 };
  it('responsável, stage, tags e interna cabem no POST; nada sobra para depois', () => {
    const plan = planNewTicket({ ...form, assigneeId: '3', statusId: '9', tags: ['VIP'], public: false }, ctx);
    expect(plan.body).toMatchObject({ assignee: 3, stage: 9, tags: [1], is_public: false });
    expect(plan.followUp).toEqual({});
  });
  it('"Novo" de fábrica ou sem status: nada de stage', () => {
    expect(planNewTicket({ ...form, statusId: '1' }, ctx).body).not.toHaveProperty('stage');
    expect(planNewTicket(form, ctx).body).not.toHaveProperty('stage');
  });
  it('categoria fechada não vai no POST (pede as datas): vira statusId do passo de fechamento', () => {
    const plan = planNewTicket({ ...form, statusId: '12' }, ctx);
    expect(plan.body).not.toHaveProperty('stage');
    expect(plan.followUp).toEqual({ statusId: '12' });
  });
  it('seguidores, tipo, CC e campos personalizados ficam para depois/local', () => {
    const plan = planNewTicket({ ...form, followerIds: ['1'], type: 'task', ccIds: ['a'], customFields: { x: '1' } }, ctx);
    expect(plan.followUp).toEqual({ followerIds: ['1'], type: 'task', ccIds: ['a'], customFields: { x: '1' } });
  });
  it('etiqueta que não existe no backend é ignorada no corpo (a execução cria antes)', () => {
    expect(planNewTicket({ ...form, tags: ['nova'] }, ctx).body).not.toHaveProperty('tags');
  });
});

describe('corpos de requisição e utilitários', () => {
  it('createTicketBody e toFormData', () => {
    expect(createTicketBody({ subject: ' S ', requesterId: '5', markdown: 'm', teamId: 2, priority: 'low' })).toEqual({ team_id: 2, subject: 'S', body: 'm', requester_id: 5, priority: 'low', with_signature: false });
    const fd = toFormData({ a: 1, b: true, c: undefined, d: 'x', t: [1, 2] }, [new File(['1'], 'f.txt')]);
    expect([...fd.keys()]).toEqual(['a', 'b', 'd', 't', 't', 'files']);
    expect(fd.get('b')).toBe('true');
    expect(fd.getAll('t')).toEqual(['1', '2']);
  });
  it('createTicketBody com triagem: assignee, stage, tags por id e is_public:false (só quando interna)', () => {
    expect(createTicketBody({ subject: 'S', requesterId: '5', markdown: 'm', teamId: 2, assigneeId: '3', stageId: '9', tagIds: [1, 2], isPublic: false })).toEqual({
      team_id: 2, subject: 'S', body: 'm', requester_id: 5, assignee: 3, stage: 9, tags: [1, 2], is_public: false, with_signature: false,
    });
    expect(createTicketBody({ subject: 'S', requesterId: '5', markdown: 'm', teamId: 2, isPublic: true, tagIds: [] })).not.toHaveProperty('is_public');
    expect(createTicketBody({ subject: 'S', requesterId: '5', markdown: 'm', teamId: 2, tagIds: [] })).not.toHaveProperty('tags');
  });
  it('resolveTagIds ignora caixa e devolve as que faltam', () => {
    expect(resolveTagIds(['VIP', 'nova', 'vip'], [{ id: 1, name: 'vip' }])).toEqual({ ids: [1], missing: ['nova'] });
  });
  it('cor em token vira hex; hex passa; slug sem acento', () => {
    expect(statusColorToHex('hold')).toBe('#8F2A35');
    expect(statusColorToHex('#2E7D32')).toBe('#2E7D32');
    expect(statusColorToHex('???')).toBe('#888888');
    expect(slugify(' Organização São João & Cia! ')).toBe('organizacao-sao-joao-cia');
  });
  it('fixture 3 (pendente): estágio de fábrica atual', () => {
    expect((ticket3 as unknown as TicketDetailDto).stage).toBe(3);
  });
});
