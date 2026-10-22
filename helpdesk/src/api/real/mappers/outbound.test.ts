import { describe, expect, it } from 'vitest';
import statusesFx from '../__fixtures__/statuses.json';
import ticket2 from '../__fixtures__/ticket-2.json';
import ticket3 from '../__fixtures__/ticket-3.json';
import ticket5 from '../__fixtures__/ticket-5.json';
import type { TicketStatus } from '@/types/domain';
import { mapStatus } from './status';
import type { StatusDto, TicketDetailDto } from './dto';
import { createTicketBody, planTicketUpdate, replyStatusFor, resolutionWindow, resolveTagIds, slugify, statusColorToHex, toFormData, validateResolutionWindow } from './outbound';

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
    expect(plan.steps.map((s) => s.kind)).toEqual(['macro', 'props', 'follow', 'reply', 'stage']);
    expect(plan.steps[1]!.body).toEqual({ priority: 'high', team: 2, assignee: 3, tags: [1] });
    expect(plan.steps[3]!.body).toMatchObject({ is_public: true, new_status: 'open' });
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
  it('estágio personalizado de outra categoria: reply (categoria) e depois estágio; mesmo estágio de fábrica: só reply', () => {
    const toCustom = planTicketUpdate({ ...base, patch: { statusId: '9' }, comment: { markdown: 'x', public: true }, current: { statusId: '3', followerIds: [] }, currentStageId: '3' });
    expect(toCustom.steps.map((s) => s.kind)).toEqual(['reply', 'stage']);
    const toFactory = planTicketUpdate({ ...base, patch: { statusId: '3' }, comment: { markdown: 'x', public: true }, current: open, currentStageId: '2' });
    expect(toFactory.steps.map((s) => s.kind)).toEqual(['reply']);
    expect(toFactory.steps[0]!.body).toMatchObject({ new_status: 'pending_customer' });
  });
  it('resolvido: sem texto = close; com texto = reply closed com janela; nota interna + resolvido = nota e depois close', () => {
    expect(planTicketUpdate({ ...base, patch: { statusId: '4' }, current: open }).steps.map((s) => s.kind)).toEqual(['close']);
    const r = planTicketUpdate({ ...base, patch: { statusId: '4' }, comment: { markdown: 'ok', public: true }, current: open });
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]).toMatchObject({ kind: 'reply', needsWindow: true });
    expect(r.steps[0]!.body).toMatchObject({ new_status: 'closed' });
    const n = planTicketUpdate({ ...base, patch: { statusId: '4' }, comment: { markdown: 'ok', public: false }, current: open });
    expect(n.steps.map((s) => s.kind)).toEqual(['reply', 'close']);
    expect(n.steps[0]!.body).not.toHaveProperty('new_status');
  });
  it('ticket fechado: reabrir sem mensagem pública é bloqueado; com mensagem reabre', () => {
    const closed = { statusId: '4', followerIds: [] as string[] };
    expect(planTicketUpdate({ ...base, patch: { statusId: '2' }, current: closed }).blocked).toMatch(/fechado/);
    expect(planTicketUpdate({ ...base, patch: { statusId: '2' }, comment: { markdown: 'x', public: false }, current: closed }).blocked).toMatch(/fechado/);
    const ok = planTicketUpdate({ ...base, patch: { statusId: '2' }, comment: { markdown: 'x', public: true }, current: closed, currentStageId: '4' });
    expect(ok.blocked).toBeUndefined();
    expect(ok.steps[0]!.body).toMatchObject({ new_status: 'open' });
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

describe('corpos de requisição e utilitários', () => {
  it('createTicketBody e toFormData', () => {
    expect(createTicketBody({ subject: ' S ', requesterId: '5', markdown: 'm', teamId: 2, priority: 'low' })).toEqual({ team_id: 2, subject: 'S', body: 'm', requester_id: 5, priority: 'low', with_signature: false });
    const fd = toFormData({ a: 1, b: true, c: undefined, d: 'x' }, [new File(['1'], 'f.txt')]);
    expect([...fd.keys()]).toEqual(['a', 'b', 'd', 'files']);
    expect(fd.get('b')).toBe('true');
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
