import type { PageOf, PageQuery, RetentionPolicyResult, RetentionRun } from '@/types/admin-b';
import { ApiError } from '../errors';
import { simulate } from './delay';

const KEYS = ['ticket_content', 'chat_content', 'audit_log', 'ticket_access_log', 'notification_read', 'outbound_email', 'report_export_file'];

const policies = (seed: number): RetentionPolicyResult[] =>
  KEYS.map((key, i) => {
    const matched = ((seed + i * 7) % 5) * 13;
    return { key, matched, applied: 0, sample: Array.from({ length: Math.min(matched, 3) }, (_, n) => `${key.slice(0, 2).toUpperCase()}-${String(100 + seed + n).padStart(5, '0')}`) };
  });

const total = (p: RetentionPolicyResult[], k: 'matched' | 'applied') => p.reduce((s, x) => s + x[k], 0);

function build(id: number, createdAt: string, reviewed: boolean): RetentionRun {
  const p = policies(id);
  return {
    id: String(id),
    dryRun: true,
    status: 'done',
    policies: p,
    finishedAt: createdAt,
    triggeredByName: id % 2 ? 'Alice Admin' : 'agendamento',
    totalMatched: total(p, 'matched'),
    totalApplied: 0,
    reviewedByName: reviewed ? 'Alice Admin' : undefined,
    reviewedAt: reviewed ? createdAt : undefined,
    reviewNote: reviewed ? 'Conferido com o jurídico.' : undefined,
    isReviewed: reviewed,
    createdAt,
  };
}

let runs: RetentionRun[] = [build(2, '2026-10-21T03:00:00-03:00', false), build(1, '2026-10-14T03:00:00-03:00', true)];
let seq = 3;

export function listRetentionRuns(f: PageQuery = {}): Promise<PageOf<RetentionRun>> {
  return simulate(() => {
    const limit = f.limit ?? 25;
    const offset = f.offset ?? 0;
    return { items: runs.slice(offset, offset + limit), total: runs.length, limit, offset };
  });
}

export function getRetentionRun(id: string): Promise<RetentionRun> {
  return simulate(() => {
    const r = runs.find((x) => x.id === id);
    if (!r) throw new ApiError('Não encontrado.', { status: 404 });
    return r;
  });
}

/** Simulação (dry-run): nada é apagado. */
export function simulateRetention(): Promise<RetentionRun> {
  return simulate(() => {
    const run = { ...build(seq++, new Date().toISOString(), false), triggeredByName: 'Você' };
    runs = [run, ...runs];
    return run;
  });
}

export function reviewRetentionRun(id: string, note: string): Promise<RetentionRun> {
  return simulate(() => {
    const r = runs.find((x) => x.id === id);
    if (!r) throw new ApiError('Não encontrado.', { status: 404 });
    if (!r.dryRun) throw new ApiError('Só simulações precisam (e podem) ser revisadas.', { status: 400 });
    const next = { ...r, isReviewed: true, reviewedByName: 'Você', reviewedAt: new Date().toISOString(), reviewNote: note.slice(0, 250) };
    runs = runs.map((x) => (x.id === id ? next : x));
    return next;
  });
}
