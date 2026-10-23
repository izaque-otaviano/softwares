import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import announcementsFx from './__fixtures__/admin-announcements.json';
import backupsFx from './__fixtures__/admin-backups.json';
import scheduleFx from './__fixtures__/admin-backup-schedule.json';
import calendarsFx from './__fixtures__/admin-calendars.json';
import plansFx from './__fixtures__/admin-plans.json';
import slaFx from './__fixtures__/admin-sla-policies.json';
import { ApiError } from '../errors';
import { resetAdminALocal } from './adminLocal';
import * as announcements from './announcements';
import * as backups from './backups';
import * as calendars from './calendars';
import * as plans from './plans';
import * as sla from './sla';

/** API real com `fetch` simulado: sucesso, 400, 403 e 404 por recurso. A restauração SÓ roda aqui, nunca no servidor. */
type Json = Record<string, any>;
interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Json | undefined;
}
let calls: Call[];
let reply: ((c: Call) => { status?: number; body?: unknown } | undefined) | undefined;

const json = (status: number, body: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  reply = undefined;
  resetAdminALocal();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://127.0.0.1');
      const call: Call = { method: init?.method ?? 'GET', path: u.pathname.replace('/api/v1', ''), query: u.searchParams, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const r = reply?.(call);
      if (r) return json(r.status ?? 200, r.body);
      return json(404, { detail: 'Não encontrado.' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const status = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ApiError;

describe('real/sla', () => {
  it('lista as políticas (envelope paginado) e mapeia', async () => {
    reply = (c) => (c.path === '/settings/sla-policies/' ? { body: slaFx } : undefined);
    const list = await sla.listSlaPolicies();
    expect(list).toHaveLength(6);
    expect(list[0]).toMatchObject({ id: '6', planName: 'Gold', teamName: 'Financeiro' });
  });

  it('cria com POST, edita com PATCH e guarda as metas por prioridade só no navegador (nunca no corpo)', async () => {
    reply = (c) => (c.method === 'POST' || c.method === 'PATCH' ? { status: c.method === 'POST' ? 201 : 200, body: { ...slaFx.results[0]!, id: 7, ...c.body } } : undefined);
    const targets = { urgent: { firstResponseMinutes: 30, resolutionMinutes: null } };
    const created = await sla.saveSlaPolicy({ name: 'Nova', planId: '3', teamId: null, firstResponseMinutes: 60, resolutionMinutes: 120, useBusinessHours: true, active: true, priorityTargets: targets });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/settings/sla-policies/' });
    expect(calls[0]!.body).toEqual({ name: 'Nova', plan: 3, team: null, first_response_minutes: 60, resolution_minutes: 120, use_business_hours: true, is_active: true });
    expect(created.priorityTargets).toEqual(targets);
    await sla.saveSlaPolicy({ id: '7', name: 'Nova', planId: '3', teamId: null, firstResponseMinutes: 60, resolutionMinutes: 120, useBusinessHours: true, active: false, priorityTargets: {} });
    expect(calls[1]).toMatchObject({ method: 'PATCH', path: '/settings/sla-policies/7/' });
  });

  it('400 de plano+equipe repetidos vira frase clara', async () => {
    reply = () => ({ status: 400, body: { non_field_errors: ['Os campos plan, team devem criar um set único.'] } });
    const e = await status(sla.saveSlaPolicy({ name: 'x', planId: '3', teamId: null, firstResponseMinutes: 1, resolutionMinutes: 2, useBusinessHours: true, active: true, priorityTargets: {} }));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(400);
    expect(e.message).toMatch(/Já existe uma política para este plano e esta equipe/);
  });

  it('400 de campo mantém fieldErrors; 403 vira a frase padrão; 404 ao excluir', async () => {
    reply = () => ({ status: 400, body: { resolution_minutes: ['O prazo de resolução não pode ser menor que o de primeira resposta.'] } });
    const e400 = await status(sla.saveSlaPolicy({ name: 'x', planId: null, teamId: null, firstResponseMinutes: 10, resolutionMinutes: 5, useBusinessHours: true, active: true, priorityTargets: {} }));
    expect(e400.fieldErrors?.resolution_minutes?.[0]).toMatch(/não pode ser menor/);
    reply = () => ({ status: 403, body: { detail: 'Apenas administradores podem alterar esta configuração.' } });
    expect((await status(sla.deleteSlaPolicy('1'))).message).toMatch(/^Você não tem permissão para esta ação\./);
    reply = () => ({ status: 404, body: { detail: 'Não encontrado.' } });
    expect((await status(sla.deleteSlaPolicy('99'))).status).toBe(404);
  });

  it('refs: planos, equipes ativas e o calendário padrão', async () => {
    reply = (c) => {
      if (c.path === '/settings/plans/') return { body: plansFx };
      if (c.path === '/settings/calendars/') return { body: calendarsFx };
      if (c.path === '/settings/teams/') return { body: { results: [{ id: 1, name: 'Suporte', is_active: true }, { id: 4, name: 'Antiga', is_active: false }], next: null } };
    };
    const refs = await sla.getSlaRefs();
    expect(refs.plans.map((p) => p.name)).toEqual(['Black', 'Platinum', 'Gold']);
    expect(refs.teams).toEqual([{ id: '1', name: 'Suporte' }]);
    expect(refs.defaultCalendar).toBe('Horário comercial');
  });
});

describe('real/calendars', () => {
  it('lista, cria com janelas e fuso, e traduz a data repetida', async () => {
    reply = (c) => (c.path === '/settings/calendars/' && c.method === 'GET' ? { body: calendarsFx } : c.method === 'POST' && c.path === '/settings/calendars/' ? { status: 201, body: { ...calendarsFx.results[0]!, id: 2, name: c.body!.name, workdays: c.body!.workdays, holidays: [] } } : undefined);
    expect((await calendars.listCalendars())[0]!.holidays).toHaveLength(13);
    const saved = await calendars.saveCalendar({ name: 'Plantão', timezone: 'America/Manaus', isDefault: false, windows: [{ weekday: 5, start: '08:00', end: '12:00' }] });
    expect(calls.at(-1)!.body).toEqual({ name: 'Plantão', timezone: 'America/Manaus', is_default: false, workdays: [{ weekday: 5, start: '08:00', end: '12:00' }] });
    expect(saved.windows).toEqual([{ weekday: 5, start: '08:00', end: '12:00' }]);
  });

  it('feriado: meio período vai com horários, recorrência fica local e data repetida vira frase clara', async () => {
    reply = (c) => (c.path === '/settings/holidays/' ? { status: 201, body: { id: 30, calendar: 1, date: c.body!.date, name: c.body!.name, start_time: c.body!.start_time, end_time: c.body!.end_time } } : undefined);
    const h = await calendars.saveHoliday({ calendarId: '1', date: '2026-12-24', name: 'Véspera', start: '09:00', end: '12:00', recurring: true });
    expect(calls[0]!.body).toEqual({ calendar: 1, date: '2026-12-24', name: 'Véspera', start_time: '09:00', end_time: '12:00' });
    expect(h).toMatchObject({ id: '30', start: '09:00', end: '12:00', recurring: true });
    reply = () => ({ status: 400, body: { non_field_errors: ['Os campos calendar, date devem criar um set único.'] } });
    expect((await status(calendars.saveHoliday({ calendarId: '1', date: '2026-12-24', name: 'x', start: null, end: null, recurring: false }))).message).toMatch(/Já existe um feriado nesta data/);
  });

  it('400 do fim antes do início, 403 e 404', async () => {
    reply = () => ({ status: 400, body: ['Para meio período, informe início E fim; para o dia todo fechado, deixe os dois em branco.'] });
    expect((await status(calendars.saveHoliday({ calendarId: '1', date: '2026-12-24', name: 'x', start: '09:00', end: null, recurring: false }))).message).toMatch(/meio período/);
    reply = () => ({ status: 403, body: { detail: 'Apenas administradores podem alterar esta configuração.' } });
    expect((await status(calendars.deleteHoliday('1'))).status).toBe(403);
    reply = undefined;
    expect((await status(calendars.deleteCalendar('99'))).status).toBe(404);
  });
});

describe('real/plans', () => {
  it('lista, cria com o identificador e DELETE desativa', async () => {
    reply = (c) => (c.method === 'GET' ? { body: plansFx } : c.method === 'POST' ? { status: 201, body: { ...plansFx.results[0]!, id: 9, ...c.body } } : { status: 204 });
    expect(await plans.listPlans()).toHaveLength(3);
    const p = await plans.savePlan({ slug: 'ouro', name: 'Ouro', description: '', active: true, rank: 5, ticketLimit: null, limitPeriod: 'monthly', monthlyMaintenanceMinutes: 90, chatEnabled: true, chatConsumesQuota: false });
    expect(calls.at(-1)!.body).toMatchObject({ slug: 'ouro', name: 'Ouro', default_ticket_limit: null, monthly_maintenance_minutes: 90 });
    expect(p.id).toBe('9');
    await plans.deletePlan('9');
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/settings/plans/9/' });
  });

  it('400 (slug obrigatório), 403 e 404', async () => {
    reply = () => ({ status: 400, body: { slug: ['Este campo é obrigatório.'] } });
    expect((await status(plans.savePlan({ name: 'x', description: '', active: true, rank: 1, ticketLimit: null, limitPeriod: 'monthly', monthlyMaintenanceMinutes: null, chatEnabled: true, chatConsumesQuota: false }))).fieldErrors?.slug?.[0]).toBe('Este campo é obrigatório.');
    reply = () => ({ status: 403, body: { detail: 'x' } });
    expect((await status(plans.deletePlan('1'))).message).toMatch(/permissão/);
    reply = undefined;
    expect((await status(plans.deletePlan('99'))).status).toBe(404);
  });
});

describe('real/backups', () => {
  it('lê a visão geral, cria (POST sem corpo) e consulta o trabalho', async () => {
    reply = (c) => {
      if (c.path === '/ferramentas/backups/' && c.method === 'GET') return { body: backupsFx };
      if (c.path === '/ferramentas/backups/' && c.method === 'POST') return { status: 201, body: backupsFx.recentes[0] };
      if (c.path === '/ferramentas/backups/trabalhos/1/') return { body: backupsFx.recentes[0] };
    };
    expect((await backups.getBackups()).files).toHaveLength(1);
    const job = await backups.createBackup();
    expect(job.status).toBe('concluido');
    expect(calls.at(-1)!.body).toBeUndefined();
    expect((await backups.getBackupJob('1')).fileName).toBe('resolv-20261023-115116.sql.gz');
  });

  it('409 quando já há backup em andamento, 403 sem permissão', async () => {
    reply = () => ({ status: 409, body: { detail: 'Já existe um backup ou restauração em andamento.' } });
    expect((await status(backups.createBackup())).message).toBe('Já existe um backup ou restauração em andamento.');
    reply = () => ({ status: 403, body: { detail: 'Apenas administradores.' } });
    expect((await status(backups.getBackups())).message).toMatch(/^Você não tem permissão para esta ação\./);
  });

  it('RESTAURAR: POST em /restaurar/ com a confirmação exigida pelo backend (fetch simulado)', async () => {
    reply = (c) => (c.path.endsWith('/restaurar/') ? { status: 202, body: { ...backupsFx.recentes[0], tipo: 'restauracao', status: 'pendente', status_label: 'Na fila' } } : undefined);
    const job = await backups.restoreBackup('resolv-20261023-115116.sql.gz');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/ferramentas/backups/resolv-20261023-115116.sql.gz/restaurar/' });
    expect(calls[0]!.body).toEqual({ confirmacao: 'RESTAURAR' });
    expect(job).toMatchObject({ kind: 'restauracao', status: 'pendente' });
  });

  it('restaurar: 400 sem confirmação e 404 de arquivo inexistente', async () => {
    reply = () => ({ status: 400, body: { confirmacao: ['Digite RESTAURAR para confirmar.'] } });
    expect((await status(backups.restoreBackup('resolv-20261023-115116.sql.gz'))).fieldErrors?.confirmacao?.[0]).toMatch(/RESTAURAR/);
    reply = undefined;
    expect((await status(backups.restoreBackup('resolv-20000101-000000.sql.gz'))).status).toBe(404);
  });

  it('excluir: DELETE com o nome codificado; 404 e 403', async () => {
    reply = () => ({ status: 204 });
    await backups.deleteBackup('resolv-20261023-115116.sql.gz');
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/ferramentas/backups/resolv-20261023-115116.sql.gz/' });
    reply = () => ({ status: 403, body: { detail: 'Apenas administradores.' } });
    expect((await status(backups.deleteBackup('x'))).status).toBe(403);
    reply = undefined;
    expect((await status(backups.deleteBackup('x'))).status).toBe(404);
  });

  it('download: devolve o conteúdo, sem pedir Accept restrito (o DRF responderia 406)', async () => {
    const fetchMock = vi.fn(async () => new Response('gz', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { blob, fileName } = await backups.downloadBackup('resolv-20261023-115116.sql.gz');
    expect(fileName).toBe('resolv-20261023-115116.sql.gz');
    expect(blob.size).toBe(2);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Accept).toBe('*/*');
    expect(init.credentials).toBe('include');
  });

  it('download: 404 e 403 viram ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { detail: 'Não encontrado.' })));
    expect((await status(backups.downloadBackup('x'))).status).toBe(404);
    vi.stubGlobal('fetch', vi.fn(async () => json(403, { detail: 'Apenas administradores.' })));
    expect((await status(backups.downloadBackup('x'))).message).toMatch(/permissão/);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('rede'); }));
    expect((await status(backups.downloadBackup('x'))).code).toBe('rede');
  });

  it('agendamento: lê e grava com PUT; 400 de hora inválida', async () => {
    reply = (c) => (c.path === '/ferramentas/backups/agendamento/' ? (c.method === 'PUT' ? { body: { ...scheduleFx, ativo: c.body!.ativo, frequencia: c.body!.frequencia, hora: c.body!.hora, dia_da_semana: c.body!.dia_da_semana } } : { body: scheduleFx }) : undefined);
    expect((await backups.getBackupSchedule()).frequency).toBe('diaria');
    const saved = await backups.saveBackupSchedule({ enabled: true, frequency: 'semanal', time: '02:30', weekday: 0 });
    expect(calls.at(-1)).toMatchObject({ method: 'PUT' });
    expect(calls.at(-1)!.body).toEqual({ ativo: true, frequencia: 'semanal', hora: '02:30', dia_da_semana: 0 });
    expect(saved).toMatchObject({ enabled: true, frequency: 'semanal', weekday: 0, time: '02:30' });
    reply = () => ({ status: 400, body: { hora: ['Este valor não corresponde ao formato exigido.'] } });
    expect((await status(backups.saveBackupSchedule({ enabled: true, frequency: 'diaria', time: '99:99', weekday: null }))).fieldErrors?.hora).toBeTruthy();
  });
});

describe('real/announcements', () => {
  it('lista com manage/history, cria, edita e DELETE desativa; dispensa por POST', async () => {
    reply = (c) => (c.method === 'GET' ? { body: announcementsFx } : c.method === 'POST' && c.path.endsWith('/dismiss/') ? { body: { dismissed: true } } : c.method === 'DELETE' ? { status: 204 } : { status: c.method === 'POST' ? 201 : 200, body: { ...announcementsFx.results[0]!, id: 5, title: c.body!.title } });
    expect(await announcements.listAnnouncements({ manage: true, history: true })).toHaveLength(1);
    expect(calls[0]!.query.get('manage')).toBe('1');
    expect(calls[0]!.query.get('history')).toBe('1');
    await announcements.listAnnouncements();
    expect(calls[1]!.query.get('manage')).toBeNull();
    const created = await announcements.saveAnnouncement({ title: 'Oi', body: 'b', kind: 'info', startsAt: '2026-01-01T00:00:00Z', endsAt: null, pinned: false, active: true, audience: 'all', targetRoles: [], targetTeamIds: [], targetCompanyIds: [], targetPlanIds: [] });
    expect(calls[2]).toMatchObject({ method: 'POST', path: '/announcements/' });
    expect(created.title).toBe('Oi');
    await announcements.saveAnnouncement({ id: '5', title: 'Oi 2', body: 'b', kind: 'info', startsAt: '2026-01-01T00:00:00Z', endsAt: null, pinned: false, active: true, audience: 'all', targetRoles: [], targetTeamIds: [], targetCompanyIds: [], targetPlanIds: [] });
    expect(calls[3]).toMatchObject({ method: 'PATCH', path: '/announcements/5/' });
    await announcements.deactivateAnnouncement('5');
    expect(calls[4]).toMatchObject({ method: 'DELETE', path: '/announcements/5/' });
    await announcements.dismissAnnouncement('5');
    expect(calls[5]).toMatchObject({ method: 'POST', path: '/announcements/5/dismiss/' });
  });

  it('400 do fim antes do início, 403 sem permissão e 404 ao dispensar aviso fora da audiência', async () => {
    const input = { title: 'x', body: 'b', kind: 'info' as const, startsAt: '2026-01-02T00:00:00Z', endsAt: '2026-01-01T00:00:00Z', pinned: false, active: true, audience: 'all' as const, targetRoles: [], targetTeamIds: [], targetCompanyIds: [], targetPlanIds: [] };
    reply = () => ({ status: 400, body: { ends_at: ['Fim da vigência deve ser depois do início.'] } });
    expect((await status(announcements.saveAnnouncement(input))).fieldErrors?.ends_at?.[0]).toMatch(/depois do início/);
    reply = () => ({ status: 403, body: { detail: 'Você não tem permissão para gerenciar avisos.' } });
    expect((await status(announcements.saveAnnouncement(input))).message).toMatch(/^Você não tem permissão para esta ação\./);
    reply = undefined;
    expect((await status(announcements.dismissAnnouncement('404'))).status).toBe(404);
  });

  it('refs do público: 403 numa lista vira vazia (supervisor), outro erro propaga', async () => {
    reply = (c) => (c.path === '/settings/teams/' ? { body: { results: [{ id: 1, name: 'Suporte' }], next: null } } : c.path === '/settings/plans/' ? { body: plansFx } : { status: 403, body: { detail: 'x' } });
    const refs = await announcements.getAudienceRefs();
    expect(refs.teams).toEqual([{ id: '1', name: 'Suporte' }]);
    expect(refs.companies).toEqual([]);
    expect(refs.plans).toHaveLength(3);
    reply = () => ({ status: 500, body: { detail: 'x' } });
    expect((await status(announcements.getAudienceRefs())).status).toBe(500);
  });
});
