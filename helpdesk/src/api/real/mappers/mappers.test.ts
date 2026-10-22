import { describe, expect, it } from 'vitest';
import type { User } from '@/types/domain';
import companies from '../__fixtures__/companies.json';
import macros from '../__fixtures__/macros.json';
import roster from '../__fixtures__/teams-roster.json';
import searchPreview from '../__fixtures__/search-preview.json';
import statuses from '../__fixtures__/statuses.json';
import summary from '../__fixtures__/summary.json';
import teams from '../__fixtures__/teams.json';
import ticket1 from '../__fixtures__/ticket-1.json';
import ticket2 from '../__fixtures__/ticket-2.json';
import ticket3 from '../__fixtures__/ticket-3.json';
import ticket5 from '../__fixtures__/ticket-5.json';
import tickets from '../__fixtures__/tickets.json';
import usersClient from '../__fixtures__/users-client.json';
import usersInternal from '../__fixtures__/users-internal.json';
import type { CompanyDto, MacroDto, MessageDto, RosterDto, SearchPreviewDto, StatusDto, SummaryDto, TeamDto, TicketDetailDto, TicketDto, UserDto } from './dto';
import {
  HELPDESK_VIEWS,
  SYSTEM_EXTRA_VIEWS,
  countsFromSummary,
  factoryStatusFor,
  mapCategory,
  mapCompany,
  mapGroupRows,
  mapMacro,
  mapMember,
  mapMessage,
  mapPersonalView,
  mapRoles,
  mapRoster,
  mapSearchRequester,
  mapSla,
  mapStatus,
  mapTeam,
  mapTicketDetail,
  mapTicketListItem,
  mapUser,
  markdownToHtml,
  matchRequesterId,
  personalViewId,
  resolveAuthorId,
  resolveStatusId,
  toBackendCategory,
} from '.';

const STATUSES = (statuses.results as StatusDto[]).map(mapStatus);
const CLIENTS = (usersClient.results as unknown as UserDto[]).map(mapUser);
const STAFF = (usersInternal.results as unknown as UserDto[]).map(mapUser);
const LIST = tickets.results as unknown as TicketDto[];
const orgName = (id?: string) => (companies.results as CompanyDto[]).find((c) => String(c.id) === id)?.name;

describe('mappers: status', () => {
  it('categorias do Resolv -> categorias do Helpdesk e de volta', () => {
    expect([mapCategory('new'), mapCategory('open'), mapCategory('pending_customer'), mapCategory('closed'), mapCategory('???')]).toEqual(['new', 'open', 'pending', 'solved', 'open']);
    expect(toBackendCategory('pending')).toBe('pending_customer');
    expect(toBackendCategory('solved')).toBe('closed');
    expect(toBackendCategory('open')).toBe('open');
  });

  it('stage vira TicketStatus: id string, categoria do stage, cor hex, flags', () => {
    expect(STATUSES.map((s) => [s.id, s.category, s.agentName, s.color, s.system, s.active])).toEqual([
      ['1', 'new', 'Novo', '#6C4E9C', true, true],
      ['2', 'open', 'Aberto', '#5A87B8', true, true],
      ['3', 'pending', 'Aguardando retorno', '#E9A23B', true, true],
      ['4', 'solved', 'Fechado', '#8A8A85', true, true],
    ]);
    expect(factoryStatusFor(STATUSES, 'solved')?.id).toBe('4');
  });

  it('stage inconsistente com a categoria (ticket reaberto) usa o stage de fábrica da categoria', () => {
    const t5 = LIST.find((t) => t.id === 5)!;
    expect(t5.status).toBe('open');
    expect(t5.stage).toBe(4); // stage "Fechado" ficou para trás na reabertura (comportamento do backend)
    expect(resolveStatusId(t5, STATUSES)).toBe('2');
    expect(resolveStatusId({ status: 'pending_customer', stage: 3 }, STATUSES)).toBe('3');
    expect(resolveStatusId({ status: 'open', stage: null }, STATUSES)).toBe('2');
  });

  it('stage customizado coerente com a categoria é mantido', () => {
    const custom = [...STATUSES, { ...STATUSES[1]!, id: '9', agentName: 'Em andamento', system: false }];
    expect(resolveStatusId({ status: 'open', stage: 9 }, custom)).toBe('9');
  });
});

describe('mappers: ticket (lista)', () => {
  it('mapeia campos escalares do item da lista', () => {
    const t = mapTicketListItem(LIST[0]!, { statuses: STATUSES, requesterId: '5' });
    expect(t).toMatchObject({
      id: 1,
      reference: 'TD-00001',
      subject: 'Página do formulário fora do ar',
      requesterId: '5',
      requesterName: 'Ana Almeida',
      companyName: 'Acme Marketing',
      assigneeGroupId: '1',
      assigneeId: undefined,
      priority: 'normal',
      statusId: '1',
      channel: 'web_form',
      source: 'web',
      detailed: false,
      comments: [],
      sla: undefined,
    });
    expect(typeof t.id).toBe('number');
  });

  it('responsável vira string e traz o nome', () => {
    const dto = LIST.find((t) => t.id === 6)!;
    expect(mapTicketListItem(dto, { statuses: STATUSES })).toMatchObject({ assigneeId: '4', assigneeName: 'Fátima Financeiro', assigneeGroupId: '2', requesterId: '' });
  });

  it('SLA: o relógio pendente mais urgente; at_risk vira warning; sem prazos é undefined', () => {
    const base = { due_at: null, state: 'none', minutes_left: null };
    expect(mapSla({ first_response: base, resolution: base })).toBeUndefined();
    expect(mapSla(undefined)).toBeUndefined();
    const sla = mapSla({
      first_response: { due_at: '2026-10-22T12:00:00Z', state: 'at_risk', minutes_left: 20 },
      resolution: { due_at: '2026-10-23T12:00:00Z', state: 'ok', minutes_left: 900 },
    });
    expect(sla).toEqual({ name: 'Primeira resposta', target: 'first_reply', dueAt: '2026-10-22T12:00:00Z', state: 'warning' });
    const breached = mapSla({
      first_response: { due_at: '2026-10-22T09:00:00Z', state: 'met', minutes_left: null },
      resolution: { due_at: '2026-10-22T10:00:00Z', state: 'breached', minutes_left: -30 },
    });
    expect(breached).toMatchObject({ name: 'Resolução', target: 'resolution', state: 'breached' });
    const met = mapSla({ first_response: { due_at: '2026-10-22T09:00:00Z', state: 'met', minutes_left: null }, resolution: base });
    expect(met?.state).toBe('met');
  });
});

describe('mappers: solicitante (casamento seguro) e autor', () => {
  it('casa por nome + empresa quando é único', () => {
    expect(matchRequesterId(LIST[0]!, CLIENTS, orgName)).toBe('5');
    expect(matchRequesterId(LIST.find((t) => t.id === 3)!, CLIENTS, orgName)).toBe('7');
  });

  it('homônimo, desconhecido ou ticket mascarado NÃO casa (resolve pelo detalhe)', () => {
    const twin: User = { ...CLIENTS[0]!, id: '99', email: 'outra@acme.test' };
    expect(matchRequesterId(LIST[0]!, [...CLIENTS, twin], orgName)).toBeUndefined();
    expect(matchRequesterId({ requester_display: 'Fulano', company_name: 'Acme Marketing' }, CLIENTS, orgName)).toBeUndefined();
    expect(matchRequesterId({ requester_display: 'Usuário protegido', company_name: null, content_hidden: true }, CLIENTS, orgName)).toBeUndefined();
  });

  it('mesmo nome em empresas diferentes casa pela empresa', () => {
    const other: User = { ...CLIENTS[0]!, id: '98', orgId: '2' };
    expect(matchRequesterId(LIST[0]!, [...CLIENTS, other], orgName)).toBe('5');
  });

  it('autor: solicitante, agente por nome; sem casamento seguro usa name:<nome>; sistema', () => {
    const ctx = { requesterId: '6', requesterName: 'Beto Barros', staff: STAFF, clients: CLIENTS };
    const msg = (author_name: string, author_is_internal: boolean, source = 'web') => ({ author_name, author_is_internal, source });
    expect(resolveAuthorId(msg('Beto Barros', false), ctx)).toBe('6');
    expect(resolveAuthorId(msg('beto  barros', false), ctx)).toBe('6');
    expect(resolveAuthorId(msg('Samuel Suporte', true), ctx)).toBe('3');
    expect(resolveAuthorId(msg('Samuel Suporte', false), ctx)).toBe('name:Samuel Suporte'); // cliente homônimo de agente não vira o agente
    expect(resolveAuthorId(msg('Fulano', true), ctx)).toBe('name:Fulano');
    expect(resolveAuthorId(msg('Sistema', true, 'system'), ctx)).toBe('system');
    const dupStaff: User[] = [...STAFF, { ...STAFF[0]!, id: '77' }];
    expect(resolveAuthorId(msg(STAFF[0]!.name, true), { ...ctx, staff: dupStaff })).toBe(`name:${STAFF[0]!.name}`);
  });
});

describe('mappers: ticket (detalhe)', () => {
  const ctx = { statuses: STATUSES, staff: STAFF, clients: CLIENTS };

  it('mensagens, eventos, solicitante (do detalhe) e autores', () => {
    const t = mapTicketDetail(ticket2 as unknown as TicketDetailDto, ctx);
    expect(t.detailed).toBe(true);
    expect(t.requesterId).toBe('6');
    expect(t.comments).toHaveLength(2);
    expect(t.comments[0]).toMatchObject({ id: '1', authorId: '6', authorName: 'Beto Barros', authorInternal: false, public: true, channel: 'web_form', bodyHtml: '<p>Como conecto o CRM de vocês ao nosso funil?</p>' });
    expect(t.comments[1]).toMatchObject({ authorId: '3', authorInternal: true });
    expect(t.events).toHaveLength(2);
    expect(t.events[1]).toMatchObject({ kind: 'field_change', authorId: '3', text: 'Status: Novo para Aberto', meta: { De: 'Novo', Para: 'Aberto' } });
    expect(t.events[0]).toMatchObject({ text: 'Ticket criado', authorId: 'system' });
  });

  it('reabertura automática vira evento do sistema', () => {
    const t = mapTicketDetail(ticket5 as unknown as TicketDetailDto, ctx);
    const reopen = t.events.find((e) => e.id === '12')!;
    expect(reopen.authorId).toBe('system');
    expect(reopen.text).toContain('reaberto');
    expect(t.statusId).toBe('2');
  });

  it('ticket sem mensagens e ticket pendente', () => {
    expect(mapTicketDetail(ticket1 as unknown as TicketDetailDto, ctx).comments).toEqual([]);
    expect(mapTicketDetail(ticket3 as unknown as TicketDetailDto, ctx).statusId).toBe('3');
  });
});

describe('mappers: corpo markdown -> HTML sanitizado', () => {
  it('converte o markdown leve do backend', () => {
    const html = markdownToHtml('Olá **mundo** e _itálico_\n\n- um\n- dois\n\n1. a\n2. b\n\n[link](https://exemplo.com/x)');
    expect(html).toContain('<strong>mundo</strong>');
    expect(html).toContain('<em>itálico</em>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<a href="https://exemplo.com/x" target="_blank" rel="noopener noreferrer">link</a>');
  });

  it('quebras de linha simples viram <br>', () => {
    expect(markdownToHtml('linha 1\nlinha 2')).toContain('<br>');
  });

  it('remove scripts, handlers e URLs perigosas', () => {
    const html = markdownToHtml('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1)) <iframe src="//e"></iframe> **ok**');
    expect(html).not.toMatch(/<(script|img|iframe)|href="?javascript/i);
    expect(html).toContain('<strong>ok</strong>');
    // HTML digitado aparece como texto, como na tela do backend
    expect(markdownToHtml('use <b>tag</b> aqui')).toBe('<p>use &lt;b&gt;tag&lt;/b&gt; aqui</p>');
    expect(markdownToHtml('[x](javascript:alert(1))')).not.toContain('href');
  });

  it('menções @[user:12] usam o nome da menção; sem par, texto neutro', () => {
    const mentions = [{ key: 'user:12', type: 'user', id: 12, name: 'Samuel Suporte' }];
    expect(markdownToHtml('Oi @[user:12] e @[team:3]', mentions)).toContain('<strong>@Samuel Suporte</strong>');
    expect(markdownToHtml('Oi @[team:3]')).toContain('<strong>@equipe</strong>');
  });

  it('mensagem apagada, assinatura e anexos', () => {
    const base: MessageDto = {
      id: 1, author_name: 'Samuel Suporte', author_avatar: null, author_is_internal: true, body: 'oi', is_public: true, source: 'web',
      created_at: '2026-10-22T10:00:00Z', attachments: [{ id: 5, filename: 'log.txt', size_bytes: 120, url: '/api/v1/attachments/5/', is_downloadable: false }],
      edited_at: null, is_deleted: false, signature_html: '<p>Att,<script>x</script> Samuel</p>',
    };
    const ctx = { staff: STAFF, clients: CLIENTS };
    const c = mapMessage(base, ctx);
    expect(c.bodyHtml).toBe('<p>oi</p><div><p>Att, Samuel</p></div>');
    expect(c.attachments).toEqual([{ name: 'log.txt', size: 120, url: '/api/v1/attachments/5/', downloadable: false }]);
    const deleted = mapMessage({ ...base, is_deleted: true, signature_html: '' }, ctx);
    expect(deleted.bodyHtml).toContain('Mensagem apagada');
    expect(deleted.deleted).toBe(true);
    expect(mapMessage({ ...base, source: 'chat' }, ctx).channel).toBe('chat');
    expect(mapMessage({ ...base, source: 'system', author_name: 'Sistema' }, ctx).authorId).toBe('system');
  });
});

describe('mappers: pessoas, empresas, grupos, macros', () => {
  it('usuários: cliente x agente x admin; sem datas inventadas', () => {
    expect(CLIENTS[0]).toMatchObject({ id: '5', name: 'Ana Almeida', role: 'end_user', orgId: '1', suspended: false });
    expect(CLIENTS[0]!.createdAt).toBeUndefined();
    expect(CLIENTS[0]!.updatedAt).toBeUndefined();
    expect(STAFF.find((u) => u.id === '1')).toMatchObject({ role: 'admin', internalRole: 'admin' });
    expect(STAFF.find((u) => u.id === '2')).toMatchObject({ role: 'agent', internalRole: 'supervisor' });
    expect(mapUser({ ...(usersClient.results[0] as unknown as UserDto), is_active: false, last_seen_at: '2026-10-01T00:00:00Z' })).toMatchObject({ suspended: true, lastSeenAt: '2026-10-01T00:00:00Z' });
  });

  it('empresa -> Org', () => {
    expect(mapCompany(companies.results[0] as CompanyDto)).toMatchObject({ id: '1', name: 'Acme Marketing', domains: [], tags: [], userAccess: 'own_tickets' });
  });

  it('equipes e roster -> grupos', () => {
    expect(mapTeam((teams.results as TeamDto[])[0]!)).toMatchObject({ id: '1', name: 'Suporte', slug: 'suporte', agentIds: [] });
    const groups = mapRoster(roster as unknown as RosterDto);
    expect(groups.map((g) => [g.id, g.name, g.agentIds.sort()])).toEqual([
      ['1', 'Suporte', ['2', '3']],
      ['2', 'Financeiro', ['2', '4']],
      ['3', 'Comercial', []],
    ]);
    const rows = mapGroupRows(groups, usersInternal.results as unknown as UserDto[]);
    expect(rows[0]).toMatchObject({ id: '1', members: 2 });
    expect(rows[0]!.memberNames.sort()).toEqual(['Samuel Suporte', 'Sofia Supervisora']);
  });

  it('membros e funções', () => {
    const groups = mapRoster(roster as unknown as RosterDto);
    const dtos = usersInternal.results as unknown as UserDto[];
    const alice = mapMember(dtos.find((u) => u.id === 1)!, groups);
    expect(alice).toMatchObject({ role: 'admin', roleLabel: 'Administrador', pending: false, suspended: false });
    expect(mapMember(dtos.find((u) => u.id === 2)!, groups)).toMatchObject({ role: 'agent', roleLabel: 'Supervisor', groups: ['Suporte', 'Financeiro'] });
    expect(mapRoles(dtos).map((r) => [r.id, r.members])).toEqual([['admin', 1], ['supervisor', 1], ['agent', 2], ['light_agent', 0]]);
  });

  it('macro: markdown -> HTML; marcadores do backend permanecem; tags por nome', () => {
    const m = mapMacro((macros.results as unknown as MacroDto[])[0]!, [{ id: 3, name: 'vip', slug: 'vip', color: '#fff' }]);
    expect(m).toMatchObject({ id: '1', name: 'Pedir mais informação', active: true, availableTo: 'all', usage7d: 0 });
    expect(m.actions.publicReply).toContain('{{solicitante}}');
    expect(m.actions.publicReply).toContain('<ul>');
    expect(m.actions.priority).toBeUndefined();
    const tagged = mapMacro({ ...(macros.results[0] as unknown as MacroDto), tags: [3, 9], priority: 'urgent' }, [{ id: 3, name: 'vip', slug: 'vip', color: '#fff' }]);
    expect(tagged.actions).toMatchObject({ addTags: ['vip'], priority: 'urgent' });
  });
});

describe('mappers: visões e busca', () => {
  it('visões do Helpdesk e do sistema têm contador e chaves únicas', () => {
    const keys = [...HELPDESK_VIEWS, ...SYSTEM_EXTRA_VIEWS].map((d) => d.view.countKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SYSTEM_EXTRA_VIEWS.every((d) => d.view.query?.view && d.view.origin === 'system')).toBe(true);
  });

  it('contadores vêm do resumo e da visão pessoal', () => {
    const personal = [{ id: 4, name: 'Urgentes', filters: { priority: 'urgent', vazio: '' }, count: 7 }];
    const counts = countsFromSummary([...HELPDESK_VIEWS, ...SYSTEM_EXTRA_VIEWS], summary as unknown as SummaryDto, personal);
    expect(counts).toMatchObject({ mine: 0, unassigned: 1, 'all-unsolved': 5, 'sys:todos': 6, 'sys:sem-atendimento': 1, 'sys:resolvidos': 1, 'pv:4': 7 });
    expect(counts.recent).toBeUndefined(); // sem equivalente exato: a store avalia localmente
    expect(countsFromSummary(HELPDESK_VIEWS, null, [])).toEqual({});
  });

  it('visão pessoal: filtros viram query; id volta ao do backend', () => {
    const v = mapPersonalView({ id: 4, name: 'Urgentes', filters: { priority: 'urgent', vazio: '' } });
    expect(v).toMatchObject({ id: 'pv:4', countKey: 'pv:4', origin: 'personal', query: { priority: 'urgent' } });
    expect(personalViewId('pv:4')).toBe(4);
    expect(personalViewId('mine')).toBeNull();
  });

  it('prévia de busca: cliente parcial', () => {
    const r = (searchPreview as unknown as SearchPreviewDto).requesters[0]!;
    expect(mapSearchRequester(r)).toMatchObject({ id: '5', name: 'Ana Almeida', role: 'end_user', orgId: '1' });
  });
});
