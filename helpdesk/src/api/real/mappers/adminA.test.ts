import { describe, expect, it } from 'vitest';
import announcementsFx from '../__fixtures__/admin-announcements.json';
import backupsFx from '../__fixtures__/admin-backups.json';
import scheduleFx from '../__fixtures__/admin-backup-schedule.json';
import calendarsFx from '../__fixtures__/admin-calendars.json';
import plansFx from '../__fixtures__/admin-plans.json';
import slaFx from '../__fixtures__/admin-sla-policies.json';
import { announcementToDto, mapAnnouncement, mapBackups, mapCalendar, mapPlan, mapSchedule, mapSlaPolicy, planToDto, scheduleToDto, slaToDto, sortWindows } from './adminA';

describe('mappers de administração A (fixtures reais do backend)', () => {
  it('política de SLA: ids viram texto, plano e equipe nulos viram null, minutos e flags seguem', () => {
    const geral = mapSlaPolicy(slaFx.results.find((p) => p.name === 'SLA Gold (geral)')!);
    expect(geral).toMatchObject({ id: '3', planId: '3', planName: 'Gold', teamId: null, teamName: null, firstResponseMinutes: 480, resolutionMinutes: 1440, useBusinessHours: true, active: true, priorityTargets: {} });
    const fin = mapSlaPolicy(slaFx.results.find((p) => p.name === 'SLA Gold (Financeiro)')!);
    expect(fin).toMatchObject({ teamId: '2', teamName: 'Financeiro' });
  });

  it('slaToDto: vazio vira null, número vira number e o nome é aparado', () => {
    expect(slaToDto({ name: '  SLA x ', planId: null, teamId: '2', firstResponseMinutes: 60, resolutionMinutes: 120, useBusinessHours: false, active: true })).toEqual({
      name: 'SLA x',
      plan: null,
      team: 2,
      first_response_minutes: 60,
      resolution_minutes: 120,
      use_business_hours: false,
      is_active: true,
    });
  });

  it('calendário: janelas ordenadas, feriados por data e horários HH:MM', () => {
    const c = mapCalendar(calendarsFx.results[0]!);
    expect(c).toMatchObject({ id: '1', name: 'Horário comercial', timezone: 'America/Sao_Paulo', isDefault: true });
    expect(c.windows).toHaveLength(5);
    expect(c.windows[0]).toEqual({ weekday: 0, start: '09:00', end: '18:00' });
    expect(c.holidays).toHaveLength(13);
    expect(c.holidays[0]).toMatchObject({ date: '2026-01-01', name: 'Confraternização Universal', start: null, end: null, recurring: false });
    expect(c.holidays.map((h) => h.date)).toEqual([...c.holidays.map((h) => h.date)].sort());
  });

  it('feriado de meio período: corta os segundos do TimeField do Django', () => {
    const c = mapCalendar({ ...calendarsFx.results[0]!, holidays: [{ id: 99, calendar: 1, date: '2026-12-24', name: 'Véspera', start_time: '09:00:00', end_time: '12:00:00' }] });
    expect(c.holidays[0]).toMatchObject({ start: '09:00', end: '12:00' });
  });

  it('sortWindows ordena por dia e depois por início', () => {
    expect(sortWindows([{ weekday: 1, start: '13:00', end: '18:00' }, { weekday: 0, start: '13:00', end: '18:00' }, { weekday: 0, start: '09:00', end: '12:00' }]).map((w) => `${w.weekday}${w.start}`)).toEqual(['009:00', '013:00', '113:00']);
  });

  it('plano: franquia em minutos, limite e chat; planToDto manda o slug só quando existe', () => {
    const black = mapPlan(plansFx.results[0]!);
    expect(black).toMatchObject({ id: '1', slug: 'black', rank: 30, ticketLimit: 30, limitPeriod: 'monthly', monthlyMaintenanceMinutes: 600, chatEnabled: true, chatConsumesQuota: false, companyCount: 3 });
    const dto = planToDto({ name: ' Ouro ', description: '', active: true, rank: 5, ticketLimit: null, limitPeriod: 'weekly', monthlyMaintenanceMinutes: null, chatEnabled: false, chatConsumesQuota: false });
    expect(dto).toMatchObject({ name: 'Ouro', default_ticket_limit: null, default_limit_period: 'weekly', monthly_maintenance_minutes: null });
    expect('slug' in dto).toBe(false);
    expect(planToDto({ slug: 'x', name: 'x', description: '', active: true, rank: 1, ticketLimit: 1, limitPeriod: 'monthly', monthlyMaintenanceMinutes: 60, chatEnabled: true, chatConsumesQuota: true }).slug).toBe('x');
  });

  it('backups: arquivos, origem conhecida, trabalho concluído com log', () => {
    const o = mapBackups(backupsFx as never);
    expect(o.running).toBeNull();
    expect(o.retentionDays).toBe(30);
    expect(o.files[0]).toMatchObject({ name: 'resolv-20261023-115116.sql.gz', sizeBytes: 87074, origin: 'manual' });
    const job = o.recent[0]!;
    expect(job).toMatchObject({ kind: 'backup', status: 'concluido', progress: 100, requestedBy: 'Alice Admin', fileName: 'resolv-20261023-115116.sql.gz' });
    expect(job.log.at(-1)).toMatchObject({ message: 'Backup concluído.', level: 'info' });
  });

  it('backups: origem desconhecida (arquivo de fora) vira null', () => {
    const o = mapBackups({ ...backupsFx, arquivos: [{ nome: 'resolv-20250101-000000.sql.gz', tamanho_bytes: 10, criado_em: '2025-01-01T00:00:00Z', origem: null }] } as never);
    expect(o.files[0]!.origin).toBeNull();
  });

  it('agendamento: ida e volta (semanal manda o dia; diário manda null)', () => {
    const s = mapSchedule(scheduleFx);
    expect(s).toEqual({ enabled: false, frequency: 'diaria', time: '23:00', weekday: null, retentionDays: 30, nextAt: null });
    expect(scheduleToDto({ enabled: true, frequency: 'semanal', time: '03:30', weekday: 0 })).toEqual({ ativo: true, frequencia: 'semanal', hora: '03:30', dia_da_semana: 0 });
    expect(scheduleToDto({ enabled: true, frequency: 'diaria', time: '03:30', weekday: 4 }).dia_da_semana).toBeNull();
  });

  it('aviso: ids viram texto e o DTO só manda o público escolhido', () => {
    const a = mapAnnouncement(announcementsFx.results[0]!);
    expect(a).toMatchObject({ id: '1', kind: 'holiday', pinned: true, active: true, audience: 'all', createdBy: 'Alice Admin', dismissed: false, targetTeamIds: [] });
    const dto = announcementToDto({ title: ' T ', body: 'b', kind: 'info', startsAt: '2026-01-01T00:00:00Z', endsAt: null, pinned: false, active: true, audience: 'teams', targetRoles: ['agent'], targetTeamIds: ['1', '2'], targetCompanyIds: ['9'], targetPlanIds: [] });
    expect(dto).toMatchObject({ title: 'T', audience_kind: 'teams', target_teams: [1, 2], target_companies: [], target_roles: [], ends_at: null });
  });
});
