import type { ChatReport, CsvFile, ReportFilters, TicketsReport } from '@/types/reports';
import {
  dayOf,
  daysBetween,
  mapChatReport,
  mapTicketsReport,
  panelSupports,
  rowsToCsv,
  type ChatMetricsDto,
  type ChatReportRowDto,
  type IndicatorsDto,
  type ReportDto,
  type ReportRowDto,
} from '../real/mappers/reports';
import { MOCK_NOW } from './data/clock';
import { db } from './db';
import { simulate } from './delay';

export { panelSupports };

/**
 * Relatórios no modo mock. Uma única população de tickets e de chats, gerada de forma determinística a partir dos dados
 * de exemplo (equipes, agentes e empresas do mock): cartões, gráficos e tabela saem sempre da mesma lista, passando
 * pelo mesmo mapeador do modo real.
 */

interface Rec {
  n: number;
  subject: string;
  orgId: string;
  company: string;
  requester: string;
  teamId: string;
  team: string;
  status: 'new' | 'open' | 'pending_customer' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  source: 'web' | 'email' | 'chat';
  assigneeId: string;
  assignee: string;
  createdAt: string;
  closedAt: string | null;
  firstResponseSeconds: number | null;
  cycleSeconds: number | null;
  slaFirst: 'on_time' | 'late' | 'none';
  slaRes: 'on_time' | 'late' | 'none';
  reopenCount: number;
  csat: number | null;
}

interface ChatRec {
  closedAt: string;
  agentId: string;
  agent: string;
  reason: string;
  answered: boolean;
  waitMinutes: number;
  durationMinutes: number;
  score: number | null;
  org: string;
}

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUBJECTS = [
  'Não consigo emitir a nota fiscal',
  'Cobrança duplicada na fatura',
  'Integração com o marketplace fora do ar',
  'Dúvida sobre o plano anual',
  'Erro ao exportar planilha de pedidos',
  'Como adicionar um novo usuário?',
  'Sistema lento no fechamento do caixa',
  'Solicitação de reembolso',
  'Atualização de dados cadastrais',
  'Relatório mensal não chegou',
];
const REASONS = ['Dúvida de uso', 'Problema técnico', 'Cobrança', 'Sem motivo'];
const DAYS_BACK = 75;

let cache: { recs: Rec[]; chats: ChatRec[] } | null = null;

function population(): { recs: Rec[]; chats: ChatRec[] } {
  if (cache) return cache;
  const rand = rng(20261023);
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)]!;
  const now = MOCK_NOW.getTime();
  const staff = db.users.filter((u) => u.role === 'agent' || u.role === 'admin');
  const clients = db.users.filter((u) => u.role === 'end_user' && u.orgId);
  const recs: Rec[] = [];
  for (let i = 0; i < 170; i++) {
    const client = pick(clients);
    const org = db.orgs.find((o) => o.id === client.orgId);
    const group = pick(db.groups);
    const members = group.agentIds.map((id) => staff.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
    const agent = members.length && rand() > 0.1 ? pick(members) : undefined;
    const ageMin = Math.floor(Math.pow(rand(), 1.25) * DAYS_BACK * 1440) + 20;
    const createdMs = now - ageMin * 60_000;
    const closing = ageMin > 300 && rand() < Math.min(0.88, 0.25 + ageMin / (20 * 1440));
    const cycle = closing ? Math.min(Math.floor((3600 + rand() * 3 * 86400) ), (ageMin - 5) * 60) : null;
    const roll = rand();
    const status: Rec['status'] = closing ? 'closed' : !agent ? 'new' : roll < 0.55 ? 'open' : roll < 0.8 ? 'pending_customer' : 'new';
    const answered = status !== 'new' || rand() < 0.1;
    const first = answered ? Math.min(Math.floor(900 + rand() * 6 * 3600), ageMin * 60 - 60) : null;
    const slaR = status === 'closed' ? (rand() < 0.86 ? 'on_time' : 'late') : 'none';
    const pr = rand();
    recs.push({
      n: 0,
      subject: pick(SUBJECTS),
      orgId: client.orgId!,
      company: org?.name ?? 'Sem empresa',
      requester: client.name,
      teamId: group.id,
      team: group.name,
      status,
      priority: pr < 0.08 ? 'urgent' : pr < 0.28 ? 'high' : pr < 0.85 ? 'normal' : 'low',
      source: rand() < 0.6 ? 'web' : rand() < 0.65 ? 'email' : 'chat',
      assigneeId: agent?.id ?? '',
      assignee: agent?.name ?? '',
      createdAt: new Date(createdMs).toISOString(),
      closedAt: cycle !== null ? new Date(createdMs + cycle * 1000).toISOString() : null,
      firstResponseSeconds: first,
      cycleSeconds: cycle,
      slaFirst: first === null ? 'none' : first <= 4 * 3600 ? 'on_time' : 'late',
      slaRes: slaR,
      reopenCount: closing && rand() < 0.07 ? 1 : 0,
      csat: closing && rand() < 0.45 ? pick([10, 10, 9, 9, 8, 8, 7, 5, 3]) : null,
    });
  }
  recs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  recs.forEach((r, i) => (r.n = i + 1));

  const chats: ChatRec[] = [];
  for (let i = 0; i < 90; i++) {
    const agent = pick(staff.filter((u) => u.role === 'agent'));
    const answered = rand() > 0.12;
    const closedMs = now - Math.floor(Math.pow(rand(), 1.2) * DAYS_BACK * 1440 * 60_000) - 600_000;
    chats.push({
      closedAt: new Date(closedMs).toISOString(),
      agentId: agent.id,
      agent: agent.name,
      reason: pick(REASONS),
      answered,
      waitMinutes: answered ? Math.round((1 + rand() * 14) * 10) / 10 : 0,
      durationMinutes: answered ? Math.round((4 + rand() * 26) * 10) / 10 : 0,
      score: answered && rand() < 0.5 ? pick([10, 10, 9, 9, 8, 7, 6, 3]) : null,
      org: pick(db.orgs).name,
    });
  }
  cache = { recs, chats };
  return cache;
}

const inRange = (iso: string | null, f: ReportFilters): boolean => {
  if (!iso) return false;
  const d = dayOf(iso);
  return d >= f.from && d <= f.to;
};

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const intAvg = (xs: number[]): number | null => (xs.length ? Math.floor(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

const toRow = (r: Rec): ReportRowDto => ({
  reference: `TD-${String(r.n).padStart(5, '0')}`,
  subject: r.subject,
  company: r.company,
  requester: r.requester,
  team: r.team,
  status: r.status,
  source: r.source,
  assignee: r.assignee,
  owner: '',
  created_at: r.createdAt,
  first_response_seconds: r.firstResponseSeconds,
  resolution_seconds: r.cycleSeconds === null ? null : Math.floor(r.cycleSeconds * 0.7),
  cycle_seconds: r.cycleSeconds,
  reopen_count: r.reopenCount,
  waiting_agent_seconds: r.status === 'closed' ? Math.floor((r.cycleSeconds ?? 0) * 0.5) : 3600,
  waiting_customer_seconds: r.status === 'pending_customer' ? 7200 : 0,
});

function tally<T extends string>(items: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return out;
}

function reportDto(f: ReportFilters): ReportDto {
  const rows = population()
    .recs.filter((r) => inRange(r.createdAt, f) && (!f.teamId || r.teamId === f.teamId) && (!f.agentId || r.assigneeId === f.agentId) && (!f.companyId || r.orgId === f.companyId))
    .map((r) => ({ rec: r, row: toRow(r) }));
  const rr = rows.map((x) => x.row);
  const vals = (k: 'first_response_seconds' | 'resolution_seconds' | 'cycle_seconds') => rr.map((r) => r[k]).filter((v): v is number => v !== null);
  return {
    summary: {
      total: rr.length,
      closed: rr.filter((r) => r.status === 'closed').length,
      reopened_tickets: rr.filter((r) => r.reopen_count > 0).length,
      reopen_events: rr.reduce((s, r) => s + r.reopen_count, 0),
      avg_first_response_seconds: intAvg(vals('first_response_seconds')),
      avg_resolution_seconds: intAvg(vals('resolution_seconds')),
      avg_cycle_seconds: intAvg(vals('cycle_seconds')),
      by_source: tally(rr.map((r) => r.source)),
      by_status: tally(rr.map((r) => r.status)),
    },
    rows: rr,
  };
}

const variation = (cur: number | null, prev: number | null): number | null => (cur === null || !prev ? null : Math.round(((cur - prev) / prev) * 10000) / 100);

function previous(f: ReportFilters): ReportFilters {
  const n = daysBetween(f.from, f.to).length;
  const shift = (d: string) => {
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() - n);
    return t.toISOString().slice(0, 10);
  };
  return { ...f, from: shift(f.from), to: shift(f.to) };
}

function indicatorFigures(f: ReportFilters) {
  const scope = population().recs.filter((r) => !f.teamId || r.teamId === f.teamId);
  const opened = scope.filter((r) => inRange(r.createdAt, f));
  const resolved = scope.filter((r) => inRange(r.closedAt, f));
  return {
    opened,
    resolved,
    onTime: resolved.filter((r) => r.slaRes === 'on_time'),
    first: avg(opened.map((r) => r.firstResponseSeconds).filter((v): v is number => v !== null)),
    resolution: avg(resolved.map((r) => r.cycleSeconds).filter((v): v is number => v !== null)),
  };
}

function indicatorsDto(f: ReportFilters): IndicatorsDto {
  const cur = indicatorFigures(f);
  const prev = indicatorFigures(previous(f));
  const answers = cur.resolved.map((r) => r.csat).filter((v): v is number => v !== null);
  const bucket = (items: { key: string; label: string; value: number }[]) => items;
  const cnt = (xs: string[], k: string) => xs.filter((x) => x === k).length;
  const priorities = [
    { key: 'low', label: 'Baixa' },
    { key: 'normal', label: 'Normal' },
    { key: 'high', label: 'Alta' },
    { key: 'urgent', label: 'Urgente' },
  ];
  const statuses = [
    { key: 'new', label: 'Novo' },
    { key: 'open', label: 'Aberto' },
    { key: 'pending_customer', label: 'Aguardando retorno' },
    { key: 'closed', label: 'Fechado' },
  ];
  const byAgent = new Map<string, number>();
  for (const r of cur.resolved) byAgent.set(r.assignee || 'Sem responsável', (byAgent.get(r.assignee || 'Sem responsável') ?? 0) + 1);
  const days = daysBetween(f.from, f.to);
  return {
    kpis: [
      { key: 'opened', value: cur.opened.length, variation: variation(cur.opened.length, prev.opened.length) },
      { key: 'resolved', value: cur.resolved.length, variation: variation(cur.resolved.length, prev.resolved.length) },
      { key: 'resolved_on_time', value: cur.onTime.length, variation: variation(cur.onTime.length, prev.onTime.length) },
      { key: 'first_response', value: cur.first, variation: variation(cur.first, prev.first) },
      { key: 'resolution', value: cur.resolution, variation: variation(cur.resolution, prev.resolution) },
      { key: 'csat', value: avg(answers), variation: null },
    ],
    by_status: bucket(statuses.map((s) => ({ ...s, value: cnt(cur.opened.map((r) => r.status), s.key) })).filter((s) => s.value > 0)),
    by_priority: bucket(priorities.map((s) => ({ ...s, value: cnt(cur.opened.map((r) => r.priority), s.key) })).filter((s) => s.value > 0)),
    first_response: [
      { key: 'no_sla', label: 'Sem SLA', value: 0 },
      { key: 'on_time', label: 'No prazo', value: cnt(cur.opened.map((r) => r.slaFirst), 'on_time') },
      { key: 'late', label: 'Fora do prazo', value: cnt(cur.opened.map((r) => r.slaFirst), 'late') },
      { key: 'waiting', label: 'Aguardando resposta', value: cnt(cur.opened.map((r) => r.slaFirst), 'none') },
    ],
    resolution: [
      { key: 'undefined', label: 'Não definido', value: 0 },
      { key: 'on_time', label: 'No prazo', value: cnt(cur.resolved.map((r) => r.slaRes), 'on_time') },
      { key: 'late', label: 'Fora do prazo', value: cnt(cur.resolved.map((r) => r.slaRes), 'late') },
    ],
    resolved_by_agent: [...byAgent.entries()].map(([label, value]) => ({ label, value })),
    timeline: days.map((date) => ({
      date,
      opened: cur.opened.filter((r) => dayOf(r.createdAt) === date).length,
      resolved: cur.resolved.filter((r) => r.closedAt && dayOf(r.closedAt) === date).length,
    })),
    satisfaction: { resolved: cur.resolved.length, answers: answers.length, average: avg(answers) },
  };
}

export function getTicketsReport(filters: ReportFilters): Promise<TicketsReport> {
  return simulate(() => mapTicketsReport(reportDto(filters), panelSupports(filters) ? indicatorsDto(filters) : null, filters));
}

const round1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10);

function chatDtos(f: ReportFilters): { metrics: ChatMetricsDto; companies: ChatReportRowDto[] } {
  const all = population().chats;
  const closed = all.filter((c) => inRange(c.closedAt, f) && (!f.agentId || c.agentId === f.agentId));
  const answered = closed.filter((c) => c.answered);
  const scores = answered.map((c) => c.score).filter((v): v is number => v !== null);
  const byAgent = new Map<string, ChatRec[]>();
  for (const c of answered) byAgent.set(c.agentId, [...(byAgent.get(c.agentId) ?? []), c]);
  const reasons = new Map<string, number>();
  for (const c of closed) reasons.set(c.reason, (reasons.get(c.reason) ?? 0) + 1);
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)]! : null;
  };
  const companies = [...new Set(all.map((c) => c.org))].map((org) => {
    const mine = all.filter((c) => c.org === org);
    const sc = mine.map((c) => c.score).filter((v): v is number => v !== null);
    return {
      rotulo: org,
      total: mine.length,
      fechados: mine.length,
      convertidos: 0,
      nao_atendidos: mine.filter((c) => !c.answered).length,
      nota_atendimento: round1(avg(sc)),
      nota_resolucao: null,
      espera_media_minutos: round1(avg(mine.filter((c) => c.answered).map((c) => c.waitMinutes))),
      atendimento_medio_minutos: round1(avg(mine.filter((c) => c.answered).map((c) => c.durationMinutes))),
    };
  });
  return {
    metrics: {
      total: closed.length,
      atendidos: answered.length,
      nao_atendidos: closed.length - answered.length,
      encerrados_automaticamente: 0,
      reabertos: 0,
      espera_minutos: { media: round1(avg(answered.map((c) => c.waitMinutes))), mediana: median(answered.map((c) => c.waitMinutes)) },
      duracao_minutos: { media: round1(avg(answered.map((c) => c.durationMinutes))), mediana: median(answered.map((c) => c.durationMinutes)) },
      avaliacao: { respondidas: scores.length, sem_resposta: answered.length - scores.length, media_atendimento: round1(avg(scores)), media_resolucao: null, detratoras: scores.filter((s) => s <= 6).length },
      por_motivo: [...reasons.entries()].map(([nome, total], i) => ({ id: i + 1, nome, total })),
      por_agente: [...byAgent.entries()].map(([id, list]) => ({
        id: Number.isNaN(Number(id)) ? 0 : Number(id),
        nome: list[0]!.agent,
        total: list.length,
        media_nota: round1(avg(list.map((c) => c.score).filter((v): v is number => v !== null))),
        duracao_media: round1(avg(list.map((c) => c.durationMinutes))),
      })),
      por_dia: daysBetween(f.from, f.to)
        .map((dia) => ({ dia, total: closed.filter((c) => dayOf(c.closedAt) === dia).length }))
        .filter((d) => d.total > 0),
    },
    companies,
  };
}

export function getChatReport(filters: ReportFilters): Promise<ChatReport> {
  return simulate(() => {
    const { metrics, companies } = chatDtos(filters);
    const report = mapChatReport(metrics, companies, filters);
    // ids do mock são texto ('me', 'a2'): o DTO numérico do backend não os comporta, então restauramos o id original
    const ids = new Map(population().chats.map((c) => [c.agent, c.agentId]));
    return { ...report, byAgent: report.byAgent.map((a) => ({ ...a, id: ids.get(a.name) ?? a.id })) };
  });
}

/** No mock o CSV é montado no navegador, com as mesmas colunas e o mesmo separador do backend. */
export function exportTicketsCsv(filters: ReportFilters): Promise<CsvFile> {
  return simulate(() => ({ filename: `resolv-tickets-${filters.to}.csv`, csv: rowsToCsv(reportDto(filters).rows) }), { critical: true });
}
