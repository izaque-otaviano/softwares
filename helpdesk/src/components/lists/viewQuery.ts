import { startOfDay, subDays } from 'date-fns';
import { CATEGORY_LABEL, CATEGORY_ORDER, PRIORITY_LABEL, TYPE_LABEL } from '@/lib/status';
import { normalize } from '@/lib/search';
import type { Priority, StatusCategory, Ticket, TicketStatus, TicketType, User } from '@/types/domain';

/** Colunas disponíveis nas visualizações (10 no total). */
export interface ColumnMeta {
  id: string;
  label: string;
  /** Tipo mostrado no ícone da gaveta de colunas. */
  kind: 'status' | 'text' | 'person' | 'date' | 'select' | 'number';
}

export const ALL_COLUMNS: ColumnMeta[] = [
  { id: 'status', label: 'Status do ticket', kind: 'status' },
  { id: 'id', label: 'ID', kind: 'number' },
  { id: 'subject', label: 'Assunto', kind: 'text' },
  { id: 'requester', label: 'Solicitante', kind: 'person' },
  { id: 'createdAt', label: 'Data da solicitação', kind: 'date' },
  { id: 'updatedAt', label: 'Última atualização', kind: 'date' },
  { id: 'type', label: 'Tipo', kind: 'select' },
  { id: 'priority', label: 'Prioridade', kind: 'select' },
  { id: 'assignee', label: 'Atribuído a', kind: 'person' },
  { id: 'group', label: 'Grupo', kind: 'text' },
];

export const DEFAULT_COLUMNS = ['status', 'subject', 'requester', 'createdAt', 'type', 'priority'];

export const columnMeta = (id: string): ColumnMeta | undefined => ALL_COLUMNS.find((c) => c.id === id);

export type DatePreset = 'any' | 'today' | '7d' | '30d' | 'range';

export interface ViewFilters {
  tags: string[];
  statusIds: string[];
  subject: string;
  requesterId: string | null;
  datePreset: DatePreset;
  /** yyyy-mm-dd (só com `datePreset: 'range'`). */
  from: string;
  to: string;
  type: TicketType | 'any';
  priority: Priority | 'any';
}

export const EMPTY_FILTERS: ViewFilters = {
  tags: [],
  statusIds: [],
  subject: '',
  requesterId: null,
  datePreset: 'any',
  from: '',
  to: '',
  type: 'any',
  priority: 'any',
};

export function countActiveFilters(f: ViewFilters): number {
  return [
    f.tags.length > 0,
    f.statusIds.length > 0,
    f.subject.trim() !== '',
    f.requesterId !== null,
    f.datePreset !== 'any',
    f.type !== 'any',
    f.priority !== 'any',
  ].filter(Boolean).length;
}

export function applyFilters(tickets: Ticket[], f: ViewFilters, now: Date = new Date()): Ticket[] {
  const subject = normalize(f.subject);
  let from: number | undefined;
  let to: number | undefined;
  if (f.datePreset === 'today') from = startOfDay(now).getTime();
  else if (f.datePreset === '7d') from = subDays(now, 7).getTime();
  else if (f.datePreset === '30d') from = subDays(now, 30).getTime();
  else if (f.datePreset === 'range') {
    if (f.from) from = new Date(`${f.from}T00:00:00`).getTime();
    if (f.to) to = new Date(`${f.to}T23:59:59.999`).getTime();
  }
  return tickets.filter((t) => {
    if (f.tags.length > 0 && !f.tags.every((tag) => t.tags.some((x) => normalize(x) === normalize(tag)))) return false;
    if (f.statusIds.length > 0 && !f.statusIds.includes(t.statusId)) return false;
    if (subject && !normalize(t.subject).includes(subject)) return false;
    if (f.requesterId && t.requesterId !== f.requesterId) return false;
    const created = new Date(t.createdAt).getTime();
    if (from !== undefined && created < from) return false;
    if (to !== undefined && created > to) return false;
    if (f.type !== 'any' && t.type !== f.type) return false;
    if (f.priority !== 'any' && t.priority !== f.priority) return false;
    return true;
  });
}

export interface Lookups {
  statuses: TicketStatus[];
  users: Map<string, User>;
  groups?: Map<string, string>;
}

export const GROUP_NAMES: Record<string, string> = { g1: 'Suporte N1', g2: 'Suporte N2' };

const PRIORITY_RANK: Record<Priority, number> = { low: 1, normal: 2, high: 3, urgent: 4 };

export function categoryOf(t: Ticket, statuses: TicketStatus[]): StatusCategory {
  return statuses.find((s) => s.id === t.statusId)?.category ?? 'open';
}

export function statusOf(t: Ticket, statuses: TicketStatus[]): TicketStatus | undefined {
  return statuses.find((s) => s.id === t.statusId);
}

export const userName = (users: Map<string, User>, id?: string): string => (id ? (users.get(id)?.name ?? '') : '');

/** Texto/número usado para ordenar uma coluna. */
function sortKey(t: Ticket, col: string, lk: Lookups): string | number {
  switch (col) {
    case 'status': {
      const cat = CATEGORY_ORDER.indexOf(categoryOf(t, lk.statuses));
      return cat * 100 + lk.statuses.findIndex((s) => s.id === t.statusId);
    }
    case 'id':
      return t.id;
    case 'subject':
      return normalize(t.subject);
    case 'requester':
      return normalize(userName(lk.users, t.requesterId));
    case 'createdAt':
      return new Date(t.createdAt).getTime();
    case 'updatedAt':
      return new Date(t.updatedAt).getTime();
    case 'type':
      return t.type ? TYPE_LABEL[t.type] : '';
    case 'priority':
      return t.priority ? PRIORITY_RANK[t.priority] : 0;
    case 'assignee':
      return normalize(userName(lk.users, t.assigneeId));
    case 'group':
      return normalize(GROUP_NAMES[t.assigneeGroupId] ?? t.assigneeGroupId);
    default:
      return 0;
  }
}

export interface SortSpec {
  columnId: string;
  direction: 'asc' | 'desc';
}

/** Ordena (estável). Com `groupByCategory` as categorias vêm primeiro, na ordem de CATEGORY_ORDER. */
export function sortTickets(tickets: Ticket[], sort: SortSpec | null, lk: Lookups, groupByCategory = false): Ticket[] {
  const dir = sort?.direction === 'desc' ? -1 : 1;
  const indexed = tickets.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    if (groupByCategory) {
      const ca = CATEGORY_ORDER.indexOf(categoryOf(a.t, lk.statuses));
      const cb = CATEGORY_ORDER.indexOf(categoryOf(b.t, lk.statuses));
      if (ca !== cb) return ca - cb;
    }
    if (sort) {
      const ka = sortKey(a.t, sort.columnId, lk);
      const kb = sortKey(b.t, sort.columnId, lk);
      const c = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), 'pt-BR');
      if (c !== 0) return c * dir;
    }
    return a.i - b.i;
  });
  return indexed.map((x) => x.t);
}

export function groupLabelText(category: StatusCategory): string {
  return `Categoria do status: ${CATEGORY_LABEL[category]}`;
}

/** Texto de uma célula (CSV e testes). */
export function cellText(t: Ticket, col: string, lk: Lookups): string {
  switch (col) {
    case 'status':
      return statusOf(t, lk.statuses)?.agentName ?? t.statusId;
    case 'id':
      return String(t.id);
    case 'subject':
      return t.subject;
    case 'requester':
      return userName(lk.users, t.requesterId);
    case 'createdAt':
      return t.createdAt;
    case 'updatedAt':
      return t.updatedAt;
    case 'type':
      return t.type ? TYPE_LABEL[t.type] : '';
    case 'priority':
      return t.priority ? PRIORITY_LABEL[t.priority] : '';
    case 'assignee':
      return userName(lk.users, t.assigneeId);
    case 'group':
      return GROUP_NAMES[t.assigneeGroupId] ?? t.assigneeGroupId;
    default:
      return '';
  }
}

function csvEscape(v: string): string {
  return /[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV (separador vírgula, CRLF) com as colunas visíveis na ordem mostrada. */
export function buildCsv(tickets: Ticket[], columnIds: string[], lk: Lookups): string {
  const cols = columnIds.filter((c) => columnMeta(c));
  const head = cols.map((c) => csvEscape(columnMeta(c)?.label ?? c)).join(',');
  const lines = tickets.map((t) => cols.map((c) => csvEscape(cellText(t, c, lk))).join(','));
  return [head, ...lines].join('\r\n');
}

/** Baixa o CSV de verdade (Blob + link temporário). Com BOM para o Excel reconhecer UTF-8. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
