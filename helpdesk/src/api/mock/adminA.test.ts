import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { announcements, backups, calendars, plans, resetAdminAMock, sla } from './adminA';

beforeEach(() => resetAdminAMock());

describe('mock de administração A', () => {
  it('SLA: recusa solução menor que a primeira resposta e plano+equipe repetidos', async () => {
    const base = { name: 'x', planId: '1', teamId: null, firstResponseMinutes: 60, resolutionMinutes: 120, useBusinessHours: true, active: true, priorityTargets: {} };
    await expect(sla.save({ ...base, resolutionMinutes: 30 })).rejects.toBeInstanceOf(ApiError);
    await expect(sla.save(base)).rejects.toThrow(/Já existe uma política/);
    const ok = await sla.save({ ...base, planId: '2', teamId: '3' });
    expect(ok.planName).toBe('Platinum');
    expect(ok.teamName).toBe('Comercial');
  });

  it('calendário padrão é único e o nome não repete', async () => {
    const created = await calendars.save({ name: 'Novo', timezone: 'America/Sao_Paulo', isDefault: true, windows: [] });
    expect((await calendars.list()).filter((c) => c.isDefault).map((c) => c.id)).toEqual([created.id]);
    await expect(calendars.save({ name: 'novo', timezone: 'America/Sao_Paulo', isDefault: false, windows: [] })).rejects.toThrow(/mesmo nome|este nome/);
  });

  it('plano: excluir desativa', async () => {
    await plans.remove('3');
    expect((await plans.list()).find((p) => p.id === '3')!.active).toBe(false);
  });

  it('backup: cria, acompanha até concluir e recusa um segundo ao mesmo tempo', async () => {
    const job = await backups.create();
    expect(job.status).toBe('rodando');
    await expect(backups.create()).rejects.toMatchObject({ status: 409 });
    expect((await backups.job(job.id)).progress).toBe(55);
    const done = await backups.job(job.id);
    expect(done.status).toBe('concluido');
    expect((await backups.get()).files.some((f) => f.name === done.fileName)).toBe(true);
    await backups.remove(done.fileName);
    await expect(backups.remove(done.fileName)).rejects.toMatchObject({ status: 404 });
  });

  it('agendamento semanal exige o dia', async () => {
    await expect(backups.saveSchedule({ enabled: true, frequency: 'semanal', time: '03:00', weekday: null })).rejects.toThrow(/dia da semana/);
    expect((await backups.saveSchedule({ enabled: true, frequency: 'semanal', time: '03:00', weekday: 2 })).weekday).toBe(2);
  });

  it('aviso: desativar mantém no histórico; dispensar marca como lido', async () => {
    await announcements.deactivate('1');
    expect((await announcements.list()).some((a) => a.id === '1')).toBe(false);
    expect((await announcements.list({ manage: true, history: true })).find((a) => a.id === '1')!.active).toBe(false);
    await announcements.dismiss('2');
    expect((await announcements.list()).find((a) => a.id === '2')!.dismissed).toBe(true);
    await expect(announcements.dismiss('999')).rejects.toMatchObject({ status: 404 });
  });
});
