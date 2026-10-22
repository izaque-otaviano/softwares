import { searchAll } from '@/lib/search';
import type { SearchResults } from '@/types/domain';
import { simulate } from './delay';
import { db, type RecentItem } from './db';

export type { RecentItem };

/** Busca global agrupada por tipo (assunto, #id, nome/e-mail parcial, usuários, orgs). */
/** `opts.full` só importa no modo real (prévia x resultados completos); no mock é a mesma busca. */
export function search(term: string, _opts: { full?: boolean } = {}): Promise<SearchResults> {
  return simulate(() => searchAll(term, db));
}

/** Itens visualizados recentemente, do mais novo ao mais antigo. */
export function recentViewed(limit = 8): Promise<RecentItem[]> {
  return simulate(() => db.recent.slice(0, limit), { critical: true });
}

/** Registra uma visualização (síncrono, sem atraso). */
export function trackViewed(item: Omit<RecentItem, 'at'>): void {
  db.recent = [{ ...item, at: new Date().toISOString() }, ...db.recent.filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, 20);
}
