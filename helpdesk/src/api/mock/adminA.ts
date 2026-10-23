import type {
  Announcement,
  AnnouncementInput,
  BackupFile,
  BackupJob,
  BackupOverview,
  BackupSchedule,
  BackupScheduleInput,
  BusinessCalendar,
  CalendarInput,
  Holiday,
  HolidayInput,
  Plan,
  PlanInput,
  RefOption,
  SlaPolicy,
  SlaPolicyInput,
} from '@/types/admin-a';
import { ApiError } from '../errors';
import { simulate } from './delay';

/** Estado em memória das telas de administração A no modo mock. `resetAdminAMock()` volta ao exemplo (testes). */
interface State {
  sla: SlaPolicy[];
  calendars: BusinessCalendar[];
  plans: Plan[];
  files: BackupFile[];
  jobs: BackupJob[];
  schedule: BackupSchedule;
  announcements: Announcement[];
  seq: number;
}

const at = (iso: string) => iso;
const fromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const weekdays = (start: string, end: string, days = [0, 1, 2, 3, 4]) => days.map((weekday) => ({ weekday, start, end }));

export const MOCK_TEAMS: RefOption[] = [
  { id: '1', name: 'Suporte' },
  { id: '2', name: 'Financeiro' },
  { id: '3', name: 'Comercial' },
];
export const MOCK_COMPANIES: RefOption[] = [
  { id: '1', name: 'Acme Marketing' },
  { id: '2', name: 'Boreal Logística' },
  { id: '3', name: 'Casa Verde Alimentos' },
];

function seed(): State {
  const plans: Plan[] = [
    { id: '1', slug: 'black', name: 'Black', description: 'Atendimento prioritário e maior franquia.', active: true, rank: 30, ticketLimit: 30, limitPeriod: 'monthly', monthlyMaintenanceMinutes: 600, chatEnabled: true, chatConsumesQuota: false, companyCount: 3 },
    { id: '2', slug: 'platinum', name: 'Platinum', description: '', active: true, rank: 20, ticketLimit: 15, limitPeriod: 'monthly', monthlyMaintenanceMinutes: 300, chatEnabled: true, chatConsumesQuota: false, companyCount: 1 },
    { id: '3', slug: 'gold', name: 'Gold', description: '', active: true, rank: 10, ticketLimit: 8, limitPeriod: 'monthly', monthlyMaintenanceMinutes: 180, chatEnabled: true, chatConsumesQuota: false, companyCount: 1 },
  ];
  const sla = (id: string, name: string, planId: string | null, teamId: string | null, first: number, res: number): SlaPolicy => ({
    id,
    name,
    planId,
    planName: plans.find((p) => p.id === planId)?.name ?? null,
    teamId,
    teamName: MOCK_TEAMS.find((t) => t.id === teamId)?.name ?? null,
    firstResponseMinutes: first,
    resolutionMinutes: res,
    useBusinessHours: true,
    active: true,
    priorityTargets: {},
  });
  const hol = (id: string, date: string, name: string, extra: Partial<Holiday> = {}): Holiday => ({ id, calendarId: '1', date, name, start: null, end: null, recurring: false, ...extra });
  const files: BackupFile[] = [
    { name: 'resolv-20261022-230000.sql.gz', sizeBytes: 91_234_816, createdAt: at('2026-10-22T23:00:12-03:00'), origin: 'agendado' },
    { name: 'resolv-20261021-230000.sql.gz', sizeBytes: 90_881_024, createdAt: at('2026-10-21T23:00:10-03:00'), origin: 'agendado' },
    { name: 'resolv-20261020-101530.sql.gz', sizeBytes: 90_112_512, createdAt: at('2026-10-20T10:15:41-03:00'), origin: 'manual' },
    { name: 'resolv-20261019-230001.sql.gz', sizeBytes: 89_700_352, createdAt: at('2026-10-19T23:00:09-03:00'), origin: null },
  ];
  const job = (id: string, f: BackupFile): BackupJob => ({
    id,
    kind: 'backup',
    status: 'concluido',
    statusLabel: 'Concluído',
    step: 'Concluído',
    progress: 100,
    log: [
      { at: f.createdAt, level: 'info', message: 'Iniciando backup…' },
      { at: f.createdAt, level: 'info', message: `backup gravado: ${f.name}` },
    ],
    error: '',
    origin: f.origin ?? 'agendado',
    fileName: f.name,
    sizeBytes: f.sizeBytes,
    createdAt: f.createdAt,
    startedAt: f.createdAt,
    finishedAt: f.createdAt,
    requestedBy: f.origin === 'manual' ? 'Alice Admin' : null,
  });
  return {
    sla: [
      sla('1', 'SLA Black (geral)', '1', null, 120, 480),
      sla('2', 'SLA Platinum (geral)', '2', null, 240, 960),
      sla('3', 'SLA Gold (geral)', '3', null, 480, 1440),
      sla('4', 'SLA Black (Financeiro)', '1', '2', 240, 960),
    ],
    calendars: [
      {
        id: '1',
        name: 'Horário comercial',
        timezone: 'America/Sao_Paulo',
        isDefault: true,
        windows: [...weekdays('09:00', '12:00'), ...weekdays('13:00', '18:00')].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)),
        holidays: [
          hol('1', '2026-11-02', 'Finados'),
          hol('2', '2026-11-15', 'Proclamação da República'),
          hol('3', '2026-11-20', 'Consciência Negra'),
          hol('4', '2026-12-24', 'Véspera de Natal', { start: '09:00', end: '12:00' }),
          hol('5', '2026-12-25', 'Natal', { recurring: true }),
        ],
      },
      { id: '2', name: 'Plantão estendido', timezone: 'America/Sao_Paulo', isDefault: false, windows: weekdays('08:00', '20:00', [0, 1, 2, 3, 4, 5]), holidays: [] },
    ],
    plans,
    files,
    jobs: files.map((f, i) => job(String(i + 1), f)),
    schedule: { enabled: true, frequency: 'diaria', time: '23:00', weekday: null, retentionDays: 30, nextAt: '2026-10-23T23:00' },
    announcements: [
      {
        id: '1',
        title: 'Recesso de fim de ano',
        body: 'Entre 24/12 e 02/01 o atendimento funciona em horário reduzido.',
        kind: 'holiday',
        startsAt: fromNow(-3),
        endsAt: fromNow(60),
        pinned: true,
        active: true,
        audience: 'all',
        targetRoles: [],
        targetTeamIds: [],
        targetCompanyIds: [],
        targetPlanIds: [],
        createdBy: 'Alice Admin',
        dismissed: false,
        createdAt: fromNow(-3),
      },
      {
        id: '2',
        title: 'Manutenção programada no sábado',
        body: 'O sistema fica indisponível das 02:00 às 04:00.',
        kind: 'urgent',
        startsAt: fromNow(-0.1),
        endsAt: fromNow(3),
        pinned: false,
        active: true,
        audience: 'all_internal',
        targetRoles: [],
        targetTeamIds: [],
        targetCompanyIds: [],
        targetPlanIds: [],
        createdBy: 'Alice Admin',
        dismissed: false,
        createdAt: fromNow(-1),
      },
    ],
    seq: 100,
  };
}

const s: State = seed();
export const resetAdminAMock = (): void => {
  Object.assign(s, seed());
};
const nextId = () => String(++s.seq);
const clone = <T>(x: T): T => structuredClone(x);

/* ---- SLA ---- */
export const sla = {
  list: () => simulate(() => clone(s.sla)),
  save: (input: SlaPolicyInput) =>
    simulate(() => {
      if (input.resolutionMinutes < input.firstResponseMinutes) throw new ApiError('O prazo de resolução não pode ser menor que o de primeira resposta.', { status: 400, fieldErrors: { resolution_minutes: ['O prazo de resolução não pode ser menor que o de primeira resposta.'] } });
      if (s.sla.some((p) => p.id !== input.id && p.planId === input.planId && p.teamId === input.teamId)) throw new ApiError('Já existe uma política para este plano e esta equipe.', { status: 400 });
      const planName = s.plans.find((p) => p.id === input.planId)?.name ?? null;
      const teamName = MOCK_TEAMS.find((t) => t.id === input.teamId)?.name ?? null;
      const saved: SlaPolicy = { ...input, name: input.name.trim(), id: input.id ?? nextId(), planName, teamName };
      const i = s.sla.findIndex((p) => p.id === saved.id);
      if (i >= 0) s.sla[i] = saved;
      else s.sla.push(saved);
      return clone(saved);
    }),
  remove: (id: string) =>
    simulate(() => {
      s.sla = s.sla.filter((p) => p.id !== id);
    }),
  refs: () => simulate(() => ({ plans: s.plans.map((p) => ({ id: p.id, name: p.name })), teams: clone(MOCK_TEAMS), defaultCalendar: s.calendars.find((c) => c.isDefault)?.name ?? null })),
};

/* ---- Calendários ---- */
export const calendars = {
  list: () => simulate(() => clone(s.calendars)),
  save: (input: CalendarInput) =>
    simulate(() => {
      if (s.calendars.some((c) => c.id !== input.id && c.name.toLowerCase() === input.name.trim().toLowerCase())) throw new ApiError('Já existe um calendário com este nome.', { status: 400, fieldErrors: { name: ['Já existe um calendário com este nome.'] } });
      const prev = s.calendars.find((c) => c.id === input.id);
      const saved: BusinessCalendar = { id: input.id ?? nextId(), name: input.name.trim(), timezone: input.timezone, isDefault: input.isDefault, windows: clone(input.windows), holidays: prev?.holidays ?? [] };
      if (saved.isDefault) s.calendars.forEach((c) => (c.isDefault = false));
      const i = s.calendars.findIndex((c) => c.id === saved.id);
      if (i >= 0) s.calendars[i] = saved;
      else s.calendars.push(saved);
      return clone(saved);
    }),
  remove: (id: string) =>
    simulate(() => {
      s.calendars = s.calendars.filter((c) => c.id !== id);
    }),
  saveHoliday: (input: HolidayInput) =>
    simulate(() => {
      const cal = s.calendars.find((c) => c.id === input.calendarId);
      if (!cal) throw new ApiError('Calendário não encontrado.', { status: 404 });
      if (cal.holidays.some((h) => h.id !== input.id && h.date === input.date)) throw new ApiError('Já existe um feriado nesta data neste calendário.', { status: 400 });
      const saved: Holiday = { id: input.id ?? nextId(), calendarId: input.calendarId, date: input.date, name: input.name.trim(), start: input.start, end: input.end, recurring: input.recurring };
      const i = cal.holidays.findIndex((h) => h.id === saved.id);
      if (i >= 0) cal.holidays[i] = saved;
      else cal.holidays.push(saved);
      cal.holidays.sort((a, b) => a.date.localeCompare(b.date));
      return clone(saved);
    }),
  removeHoliday: (id: string) =>
    simulate(() => {
      s.calendars.forEach((c) => (c.holidays = c.holidays.filter((h) => h.id !== id)));
    }),
};

/* ---- Planos ---- */
export const plans = {
  list: () => simulate(() => clone(s.plans)),
  save: (input: PlanInput) =>
    simulate(() => {
      const prev = s.plans.find((p) => p.id === input.id);
      const slug = input.slug || prev?.slug || input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const saved: Plan = { ...input, name: input.name.trim(), id: input.id ?? nextId(), slug, companyCount: prev?.companyCount ?? 0 };
      const i = s.plans.findIndex((p) => p.id === saved.id);
      if (i >= 0) s.plans[i] = saved;
      else s.plans.push(saved);
      s.plans.sort((a, b) => b.rank - a.rank);
      return clone(saved);
    }),
  remove: (id: string) =>
    simulate(() => {
      const p = s.plans.find((x) => x.id === id);
      if (p) p.active = false;
    }),
};

/* ---- Backups ---- */
const stamp = (d: Date) => {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
};
export const backups = {
  get: (): Promise<BackupOverview> =>
    simulate(() => ({
      running: clone(s.jobs.find((j) => j.status === 'pendente' || j.status === 'rodando') ?? null),
      files: clone([...s.files].sort((a, b) => b.name.localeCompare(a.name))),
      recent: clone([...s.jobs].reverse().slice(0, 20)),
      directory: '/var/backups/resolv',
      retentionDays: s.schedule.retentionDays,
    })),
  create: (): Promise<BackupJob> =>
    simulate(() => {
      if (s.jobs.some((j) => j.status === 'pendente' || j.status === 'rodando')) throw new ApiError('Já existe um backup ou restauração em andamento.', { status: 409 });
      const now = new Date();
      const name = `resolv-${stamp(now)}.sql.gz`;
      const job: BackupJob = {
        id: nextId(),
        kind: 'backup',
        status: 'rodando',
        statusLabel: 'Em andamento',
        step: 'Gerando o dump do banco',
        progress: 10,
        log: [{ at: now.toISOString(), level: 'info', message: 'Iniciando backup…' }],
        error: '',
        origin: 'manual',
        fileName: '',
        sizeBytes: null,
        createdAt: now.toISOString(),
        startedAt: now.toISOString(),
        finishedAt: null,
        requestedBy: 'Alice Admin',
      };
      s.jobs.push(job);
      pending.set(job.id, { name, polls: 0 });
      return clone(job);
    }),
  job: (id: string): Promise<BackupJob> =>
    simulate(() => {
      const job = s.jobs.find((j) => j.id === id);
      if (!job) throw new ApiError('Não encontrado.', { status: 404 });
      const p = pending.get(id);
      if (p && (job.status === 'rodando' || job.status === 'pendente')) {
        p.polls += 1;
        if (p.polls < 2) {
          job.progress = 55;
          job.step = 'Comprimindo';
        } else {
          const now = new Date().toISOString();
          const file: BackupFile = { name: p.name, sizeBytes: 91_500_000, createdAt: now, origin: job.origin };
          if (job.kind === 'backup') s.files.push(file);
          Object.assign(job, { status: 'concluido', statusLabel: 'Concluído', step: 'Concluído', progress: 100, finishedAt: now, fileName: job.kind === 'backup' ? p.name : job.fileName, sizeBytes: job.kind === 'backup' ? file.sizeBytes : null });
          job.log.push({ at: now, level: 'info', message: job.kind === 'backup' ? 'Backup concluído.' : 'Restauração concluída.' });
          pending.delete(id);
        }
      }
      return clone(job);
    }),
  remove: (name: string): Promise<void> =>
    simulate(() => {
      if (!s.files.some((f) => f.name === name)) throw new ApiError('Não encontrado.', { status: 404 });
      s.files = s.files.filter((f) => f.name !== name);
    }),
  restore: (name: string): Promise<BackupJob> =>
    simulate(() => {
      if (!s.files.some((f) => f.name === name)) throw new ApiError('Não encontrado.', { status: 404 });
      const now = new Date().toISOString();
      const job: BackupJob = { id: nextId(), kind: 'restauracao', status: 'rodando', statusLabel: 'Em andamento', step: 'Restaurando', progress: 20, log: [{ at: now, level: 'info', message: 'Iniciando restauração…' }], error: '', origin: 'manual', fileName: name, sizeBytes: null, createdAt: now, startedAt: now, finishedAt: null, requestedBy: 'Alice Admin' };
      s.jobs.push(job);
      pending.set(job.id, { name, polls: 0 });
      return clone(job);
    }),
  download: (name: string): Promise<{ blob: Blob; fileName: string }> =>
    simulate(() => {
      if (!s.files.some((f) => f.name === name)) throw new ApiError('Não encontrado.', { status: 404 });
      return { blob: new Blob(['Arquivo de exemplo do modo de demonstração.'], { type: 'application/gzip' }), fileName: name };
    }),
  getSchedule: (): Promise<BackupSchedule> => simulate(() => clone(s.schedule)),
  saveSchedule: (input: BackupScheduleInput): Promise<BackupSchedule> =>
    simulate(() => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new ApiError('Hora inválida. Use HH:MM.', { status: 400 });
      if (input.frequency === 'semanal' && input.weekday === null) throw new ApiError('Escolha o dia da semana.', { status: 400 });
      s.schedule = { ...s.schedule, ...input, weekday: input.frequency === 'semanal' ? input.weekday : null, nextAt: input.enabled ? s.schedule.nextAt ?? '2026-10-23T23:00' : null };
      return clone(s.schedule);
    }),
};
const pending = new Map<string, { name: string; polls: number }>();

/* ---- Avisos ---- */
export const announcements = {
  list: (opts: { manage?: boolean; history?: boolean } = {}) =>
    simulate(() => {
      const now = Date.now();
      const live = (a: Announcement) => a.active && new Date(a.startsAt).getTime() <= now && (!a.endsAt || new Date(a.endsAt).getTime() >= now);
      const rows = s.announcements.filter((a) => (opts.history ? true : opts.manage ? live(a) : live(a) && a.audience !== 'all_clients'));
      return clone(rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.startsAt.localeCompare(a.startsAt)));
    }),
  save: (input: AnnouncementInput) =>
    simulate(() => {
      if (input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) throw new ApiError('Fim da vigência deve ser depois do início.', { status: 400, fieldErrors: { ends_at: ['Fim da vigência deve ser depois do início.'] } });
      const prev = s.announcements.find((a) => a.id === input.id);
      const saved: Announcement = { ...input, title: input.title.trim(), id: input.id ?? nextId(), createdBy: prev?.createdBy ?? 'Alice Admin', dismissed: prev?.dismissed ?? false, createdAt: prev?.createdAt ?? new Date().toISOString() };
      const i = s.announcements.findIndex((a) => a.id === saved.id);
      if (i >= 0) s.announcements[i] = saved;
      else s.announcements.push(saved);
      return clone(saved);
    }),
  deactivate: (id: string) =>
    simulate(() => {
      const a = s.announcements.find((x) => x.id === id);
      if (a) a.active = false;
    }),
  dismiss: (id: string) =>
    simulate(() => {
      const a = s.announcements.find((x) => x.id === id);
      if (!a) throw new ApiError('Não encontrado.', { status: 404 });
      a.dismissed = true;
    }),
  refs: () =>
    simulate(() => ({ teams: clone(MOCK_TEAMS), companies: clone(MOCK_COMPANIES), plans: s.plans.map((p) => ({ id: p.id, name: p.name })) })),
};
