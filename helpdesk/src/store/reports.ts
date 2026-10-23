import { create } from 'zustand';
import * as reportsApi from '@/api/reports';
import { downloadCsv } from '@/components/lists/viewQuery';
import { presetRange, rangeError, type PeriodPreset } from '@/components/reports/periods';
import { errMessage } from '@/lib/apiError';
import type { ChatReport, ReportFilters, TicketsReport } from '@/types/reports';

export type ReportTab = 'tickets' | 'chat';

interface Loadable<T> {
  data?: T;
  loading: boolean;
  error?: string;
  /** Instante da última carga bem-sucedida (ms). */
  updatedAt?: number;
  /** Chave dos filtros que `data` representa. */
  key?: string;
}

interface ReportsState {
  tab: ReportTab;
  preset: PeriodPreset;
  from: string;
  to: string;
  teamId: string;
  agentId: string;
  companyId: string;
  tickets: Loadable<TicketsReport>;
  chat: Loadable<ChatReport>;
  exporting: boolean;
  setTab: (tab: ReportTab) => void;
  setPreset: (preset: Exclude<PeriodPreset, 'custom'>) => void;
  setCustomRange: (from: string, to: string) => void;
  setFilter: (key: 'teamId' | 'agentId' | 'companyId', value: string) => void;
  clearFilters: () => void;
  /** Carrega a aba se ainda não tem os dados dos filtros atuais. */
  ensure: (tab?: ReportTab) => Promise<void>;
  /** Recarrega a aba (botão "Atualizar" e "Tentar novamente"). */
  refresh: (tab?: ReportTab) => Promise<void>;
  exportCsv: () => Promise<{ ok: true; filename: string } | { ok: false; message: string }>;
}

const seq: Record<ReportTab, number> = { tickets: 0, chat: 0 };

/** Filtros que cada aba usa: o chat só aceita período e responsável. */
export function filtersFor(s: Pick<ReportsState, 'from' | 'to' | 'teamId' | 'agentId' | 'companyId'>, tab: ReportTab): ReportFilters {
  const f: ReportFilters = { from: s.from, to: s.to };
  if (s.agentId) f.agentId = s.agentId;
  if (tab === 'tickets') {
    if (s.teamId) f.teamId = s.teamId;
    if (s.companyId) f.companyId = s.companyId;
  }
  return f;
}

export const filterKey = (f: ReportFilters): string => JSON.stringify([f.from, f.to, f.teamId ?? '', f.agentId ?? '', f.companyId ?? '']);

const initial = presetRange('30d');

export const useReports = create<ReportsState>()((set, get) => {
  async function run(tab: ReportTab, force: boolean): Promise<void> {
    const s = get();
    const filters = filtersFor(s, tab);
    const key = filterKey(filters);
    const slot = s[tab];
    if (!force && slot.key === key && slot.data && !slot.error) return;
    const invalid = rangeError(filters.from, filters.to);
    const patch = (p: Partial<Loadable<TicketsReport | ChatReport>>) => set({ [tab]: { ...get()[tab], ...p } } as Partial<ReportsState>);
    if (invalid) {
      patch({ loading: false, error: invalid, data: undefined, key: undefined });
      return;
    }
    const mine = ++seq[tab];
    patch({ loading: true, error: undefined });
    try {
      const data = tab === 'tickets' ? await reportsApi.getTicketsReport(filters) : await reportsApi.getChatReport(filters);
      if (mine !== seq[tab]) return;
      patch({ data, loading: false, error: undefined, updatedAt: Date.now(), key });
    } catch (e) {
      if (mine !== seq[tab]) return;
      patch({ loading: false, error: errMessage(e, 'Não foi possível carregar o relatório.'), data: undefined, key: undefined });
    }
  }

  const reset = (): Partial<ReportsState> => ({
    tickets: { ...get().tickets, key: undefined },
    chat: { ...get().chat, key: undefined },
  });

  return {
    tab: 'tickets',
    preset: '30d',
    from: initial.from,
    to: initial.to,
    teamId: '',
    agentId: '',
    companyId: '',
    tickets: { loading: false },
    chat: { loading: false },
    exporting: false,
    setTab: (tab) => set({ tab }),
    setPreset: (preset) => set({ preset, ...presetRange(preset), ...reset() }),
    setCustomRange: (from, to) => set({ preset: 'custom', from, to, ...reset() }),
    setFilter: (key, value) => set({ [key]: value, ...reset() } as Partial<ReportsState>),
    clearFilters: () => set({ teamId: '', agentId: '', companyId: '', ...reset() }),
    ensure: (tab) => run(tab ?? get().tab, false),
    refresh: (tab) => run(tab ?? get().tab, true),
    async exportCsv() {
      const filters = filtersFor(get(), 'tickets');
      const invalid = rangeError(filters.from, filters.to);
      if (invalid) return { ok: false, message: invalid };
      set({ exporting: true });
      try {
        const file = await reportsApi.exportTicketsCsv(filters);
        downloadCsv(file.filename, file.csv);
        return { ok: true, filename: file.filename };
      } catch (e) {
        return { ok: false, message: errMessage(e, 'Não foi possível exportar o CSV.') };
      } finally {
        set({ exporting: false });
      }
    },
  };
});

/** Só para testes. */
export function resetReports(): void {
  seq.tickets = 0;
  seq.chat = 0;
  const r = presetRange('30d');
  useReports.setState({ tab: 'tickets', preset: '30d', ...r, teamId: '', agentId: '', companyId: '', tickets: { loading: false }, chat: { loading: false }, exporting: false });
}
