import type {
  ChatAgentRow,
  ChatCompanyRow,
  ChatMetrics,
  ChatReport,
  DayPoint,
  Kpi,
  ReportFilters,
  SlaBuckets,
  Slice,
  TicketRow,
  TicketsPanel,
  TicketsReport,
} from '@/types/reports';

/** Respostas do backend (`/reports/tickets/`, `/reports/indicators/`, `/chat/chats/metrics/`, `/chat/reports/`). */

export interface ReportRowDto {
  reference: string;
  subject: string;
  company: string;
  requester: string;
  team: string;
  status: string;
  source: string;
  assignee: string;
  owner?: string;
  created_at: string;
  first_response_seconds: number | null;
  resolution_seconds: number | null;
  cycle_seconds: number | null;
  reopen_count: number;
  waiting_agent_seconds?: number;
  waiting_customer_seconds?: number;
}

export interface ReportDto {
  summary: {
    total: number;
    closed: number;
    reopened_tickets: number;
    reopen_events?: number;
    avg_first_response_seconds: number | null;
    avg_resolution_seconds: number | null;
    avg_cycle_seconds: number | null;
    by_source: Record<string, number>;
    by_status: Record<string, number>;
  };
  rows: ReportRowDto[];
}

interface LabelValue {
  key?: string;
  label: string;
  value: number;
}

export interface IndicatorsDto {
  kpis: { key: string; value: number | null; variation: number | null }[];
  by_status: LabelValue[];
  by_priority: LabelValue[];
  first_response: LabelValue[];
  resolution: LabelValue[];
  resolved_by_agent: LabelValue[];
  timeline: { date: string; opened: number; resolved: number }[];
  satisfaction: { resolved: number; answers: number; average: number | null };
}

export interface ChatMetricsDto {
  total: number;
  atendidos: number;
  nao_atendidos: number;
  encerrados_automaticamente: number;
  reabertos: number;
  espera_minutos: { media: number | null; mediana: number | null };
  duracao_minutos: { media: number | null; mediana: number | null };
  avaliacao: { respondidas: number; sem_resposta: number; media_atendimento: number | null; media_resolucao: number | null; detratoras: number };
  por_motivo: { id: number | null; nome: string; total: number }[];
  por_agente: { id: number; nome: string; total: number; media_nota: number | null; duracao_media: number | null }[];
  por_dia: { dia: string; total: number }[];
}

export interface ChatReportRowDto {
  rotulo: string | null;
  total: number;
  fechados: number;
  convertidos: number;
  nao_atendidos: number;
  nota_atendimento: number | null;
  nota_resolucao: number | null;
  espera_media_minutos: number | null;
  atendimento_medio_minutos: number | null;
}

export const STATUS_LABEL: Record<string, string> = {
  new: 'Novo',
  open: 'Aberto',
  pending_customer: 'Aguardando retorno',
  closed: 'Fechado',
};

export const SOURCE_LABEL: Record<string, string> = {
  web: 'Formulário web',
  email: 'E-mail',
  chat: 'Chat',
  internal: 'Interno',
  api: 'API',
  whatsapp: 'WhatsApp',
};


const SP_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dia (AAAA-MM-DD) de um instante no fuso do backend (São Paulo). */
export function dayOf(iso: string): string {
  return SP_DAY.format(new Date(iso));
}

/** Todos os dias de `from` a `to` (inclusive). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end && out.length < 800) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const sortDesc = (a: Slice, b: Slice) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR');

function countBy(values: string[], label: (v: string) => string): Slice[] {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].map(([key, value]) => ({ key, label: label(key), value })).sort(sortDesc);
}

export function mapRow(dto: ReportRowDto): TicketRow {
  return {
    reference: dto.reference,
    subject: dto.subject,
    company: dto.company,
    requester: dto.requester,
    team: dto.team,
    status: dto.status,
    statusLabel: STATUS_LABEL[dto.status] ?? dto.status,
    source: dto.source,
    sourceLabel: SOURCE_LABEL[dto.source] ?? dto.source,
    assignee: dto.assignee,
    createdAt: dto.created_at,
    firstResponseSeconds: dto.first_response_seconds,
    resolutionSeconds: dto.resolution_seconds,
    cycleSeconds: dto.cycle_seconds,
    reopenCount: dto.reopen_count,
  };
}

function kpi(dto: IndicatorsDto, key: string): Kpi {
  const found = dto.kpis.find((k) => k.key === key);
  return { value: found?.value ?? null, variation: found?.variation ?? null };
}

function sla(list: LabelValue[]): SlaBuckets {
  const get = (k: string) => list.find((i) => i.key === k)?.value ?? 0;
  const onTime = get('on_time');
  const late = get('late');
  return { onTime, late, other: list.reduce((s, i) => s + i.value, 0) - onTime - late };
}

const slice = (i: LabelValue, n: number): Slice => ({ key: i.key ?? `${n}`, label: i.label, value: i.value });

export function mapPanel(dto: IndicatorsDto): TicketsPanel {
  const timeline: DayPoint[] = dto.timeline.map((t) => ({ date: t.date, opened: t.opened, resolved: t.resolved }));
  return {
    opened: kpi(dto, 'opened'),
    resolved: kpi(dto, 'resolved'),
    resolvedOnTime: kpi(dto, 'resolved_on_time'),
    firstResponseSeconds: kpi(dto, 'first_response'),
    resolutionSeconds: kpi(dto, 'resolution'),
    csat: { average: dto.satisfaction.average, answers: dto.satisfaction.answers, resolved: dto.satisfaction.resolved },
    firstResponseSla: sla(dto.first_response),
    resolutionSla: sla(dto.resolution),
    timeline,
    byStatus: dto.by_status.map(slice).sort(sortDesc),
    byPriority: dto.by_priority.map(slice).sort(sortDesc),
    resolvedByAgent: dto.resolved_by_agent.map(slice).sort(sortDesc),
  };
}

/** Junta o relatório detalhado e (quando o filtro permite) o painel de indicadores. */
export function mapTicketsReport(report: ReportDto, panel: IndicatorsDto | null, filters: ReportFilters): TicketsReport {
  const rows = report.rows.map(mapRow);
  const s = report.summary;
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(dayOf(r.createdAt), (byDay.get(dayOf(r.createdAt)) ?? 0) + 1);
  return {
    filters,
    summary: {
      total: s.total,
      closed: s.closed,
      reopenedTickets: s.reopened_tickets,
      avgFirstResponseSeconds: s.avg_first_response_seconds,
      avgResolutionSeconds: s.avg_resolution_seconds,
      avgCycleSeconds: s.avg_cycle_seconds,
      byStatus: Object.entries(s.by_status)
        .map(([key, value]) => ({ key, label: STATUS_LABEL[key] ?? key, value }))
        .sort(sortDesc),
      bySource: Object.entries(s.by_source)
        .map(([key, value]) => ({ key, label: SOURCE_LABEL[key] ?? key, value }))
        .sort(sortDesc),
    },
    rows,
    byTeam: countBy(
      rows.map((r) => r.team),
      (t) => t,
    ),
    createdByDay: daysBetween(filters.from, filters.to).map((date) => ({ date, count: byDay.get(date) ?? 0 })),
    panel: panel ? mapPanel(panel) : null,
  };
}

export function mapChatReport(metrics: ChatMetricsDto, byCompany: ChatReportRowDto[], filters: ReportFilters): ChatReport {
  const perDay = new Map(metrics.por_dia.map((d) => [d.dia, d.total]));
  const m: ChatMetrics = {
    total: metrics.total,
    answered: metrics.atendidos,
    unanswered: metrics.nao_atendidos,
    autoClosed: metrics.encerrados_automaticamente,
    reopened: metrics.reabertos,
    waitMinutes: { mean: metrics.espera_minutos.media, median: metrics.espera_minutos.mediana },
    durationMinutes: { mean: metrics.duracao_minutos.media, median: metrics.duracao_minutos.mediana },
    ratings: {
      answered: metrics.avaliacao.respondidas,
      unanswered: metrics.avaliacao.sem_resposta,
      serviceMean: metrics.avaliacao.media_atendimento,
      resolutionMean: metrics.avaliacao.media_resolucao,
      detractors: metrics.avaliacao.detratoras,
    },
  };
  const agents: ChatAgentRow[] = metrics.por_agente
    .map((a) => ({ id: String(a.id), name: a.nome, total: a.total, scoreMean: a.media_nota, durationMinutes: a.duracao_media }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  const companies: ChatCompanyRow[] = byCompany.map((r) => ({
    label: r.rotulo ?? 'Sem empresa',
    total: r.total,
    closed: r.fechados,
    converted: r.convertidos,
    unanswered: r.nao_atendidos,
    serviceScore: r.nota_atendimento,
    resolutionScore: r.nota_resolucao,
    waitMinutes: r.espera_media_minutos,
    durationMinutes: r.atendimento_medio_minutos,
  }));
  return {
    filters,
    metrics: m,
    daily: daysBetween(filters.from, filters.to).map((date) => ({ date, count: perDay.get(date) ?? 0 })),
    byAgent: agents,
    byReason: metrics.por_motivo
      .map((r, i) => ({ key: String(r.id ?? `n${i}`), label: r.nome, value: r.total }))
      .sort(sortDesc),
    byCompany: companies,
  };
}

export const CSV_COLUMNS = [
  'reference', 'subject', 'company', 'requester', 'team', 'status', 'source', 'assignee', 'owner', 'created_at',
  'first_response_seconds', 'resolution_seconds', 'cycle_seconds', 'waiting_agent_seconds', 'waiting_customer_seconds', 'reopen_count',
] as const;

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV no mesmo formato do backend (separador `;`, mesmas colunas), usado no modo mock. */
export function rowsToCsv(rows: ReportRowDto[]): string {
  const lines = [CSV_COLUMNS.join(';'), ...rows.map((r) => CSV_COLUMNS.map((c) => csvCell((r as unknown as Record<string, unknown>)[c])).join(';'))];
  return `${lines.join('\r\n')}\r\n`;
}

/** O painel de indicadores não aceita responsável nem empresa; com eles só vale o relatório detalhado. */
export const panelSupports = (f: ReportFilters): boolean => !f.agentId && !f.companyId;
