/** Tipos da área de Relatórios (modelo do front; o backend usa nomes diferentes, veja `api/real/mappers/reports.ts`). */

/** Datas no formato AAAA-MM-DD (dia local). */
export interface ReportFilters {
  from: string;
  to: string;
  /** Equipe (tickets). */
  teamId?: string;
  /** Responsável (tickets e chat). */
  agentId?: string;
  /** Empresa (tickets). */
  companyId?: string;
}

export interface Slice {
  key: string;
  label: string;
  value: number;
}

/** Indicador com variação percentual sobre o período anterior (nula quando o backend não tem como comparar). */
export interface Kpi {
  value: number | null;
  variation: number | null;
}

export interface DayPoint {
  date: string;
  opened: number;
  resolved: number;
}

export interface SlaBuckets {
  onTime: number;
  late: number;
  /** Sem prazo definido (ou ainda sem resposta). */
  other: number;
}

/** Indicadores do painel gerencial (`/reports/indicators/`): só existem por período e equipe. */
export interface TicketsPanel {
  opened: Kpi;
  resolved: Kpi;
  resolvedOnTime: Kpi;
  firstResponseSeconds: Kpi;
  resolutionSeconds: Kpi;
  csat: { average: number | null; answers: number; resolved: number };
  firstResponseSla: SlaBuckets;
  resolutionSla: SlaBuckets;
  timeline: DayPoint[];
  byStatus: Slice[];
  byPriority: Slice[];
  resolvedByAgent: Slice[];
}

/** Linha do relatório detalhado (um ticket). */
export interface TicketRow {
  reference: string;
  subject: string;
  company: string;
  requester: string;
  team: string;
  status: string;
  statusLabel: string;
  source: string;
  sourceLabel: string;
  assignee: string;
  createdAt: string;
  firstResponseSeconds: number | null;
  resolutionSeconds: number | null;
  cycleSeconds: number | null;
  reopenCount: number;
}

export interface TicketsSummary {
  total: number;
  closed: number;
  reopenedTickets: number;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
  avgCycleSeconds: number | null;
  byStatus: Slice[];
  bySource: Slice[];
}

export interface TicketsReport {
  filters: ReportFilters;
  summary: TicketsSummary;
  rows: TicketRow[];
  /** Equipes contadas a partir das linhas do relatório. */
  byTeam: Slice[];
  /** Tickets criados por dia, contados a partir das linhas (não vem pronto do backend). */
  createdByDay: { date: string; count: number }[];
  /** `null` quando o filtro inclui responsável ou empresa: o painel de indicadores não aceita esses filtros. */
  panel: TicketsPanel | null;
}

export interface ChatMetrics {
  total: number;
  answered: number;
  unanswered: number;
  autoClosed: number;
  reopened: number;
  waitMinutes: { mean: number | null; median: number | null };
  durationMinutes: { mean: number | null; median: number | null };
  ratings: { answered: number; unanswered: number; serviceMean: number | null; resolutionMean: number | null; detractors: number };
}

export interface ChatAgentRow {
  id: string;
  name: string;
  total: number;
  scoreMean: number | null;
  durationMinutes: number | null;
}

export interface ChatCompanyRow {
  label: string;
  total: number;
  closed: number;
  converted: number;
  unanswered: number;
  serviceScore: number | null;
  resolutionScore: number | null;
  waitMinutes: number | null;
  durationMinutes: number | null;
}

export interface ChatReport {
  filters: ReportFilters;
  metrics: ChatMetrics;
  /** Chats encerrados por dia, com os dias sem chats preenchidos com zero. */
  daily: { date: string; count: number }[];
  byAgent: ChatAgentRow[];
  byReason: Slice[];
  /** Todo o histórico (o backend não filtra esta tabela por período). */
  byCompany: ChatCompanyRow[];
}

export interface CsvFile {
  filename: string;
  csv: string;
}
