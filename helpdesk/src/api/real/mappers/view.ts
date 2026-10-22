import type { View } from '@/types/domain';
import type { PersonalViewDto, SummaryDto } from './dto';

const COLS = ['status', 'subject', 'requester', 'createdAt', 'type', 'priority'];

/** Como obter o contador de uma visão no servidor: chave de `/tickets/resumo/` `visoes`, ou o `count` de um GET /tickets/. */
export interface ServerCount {
  slug?: string;
  query?: Record<string, string>;
}

export interface ViewDef {
  view: View;
  /** Ausente = sem equivalente exato no servidor: o contador sai da avaliação local sobre os tickets carregados. */
  serverCount?: ServerCount;
}

const helpdeskView = (v: Omit<View, 'columns' | 'origin'>, serverCount?: ServerCount): ViewDef => ({ view: { ...v, columns: COLS, origin: 'helpdesk' }, serverCount });

/**
 * As 6 visões do Helpdesk, avaliadas no navegador sobre os tickets carregados (`conditions`). Quando o servidor tem um
 * equivalente EXATO, o contador vem dele (resumo/GET count) e vale mais que o local.
 */
export const HELPDESK_VIEWS: ViewDef[] = [
  helpdeskView(
    { id: 'mine', name: 'Seus tickets sem resolução', conditions: { all: [{ field: 'assignee', operator: 'is', value: 'me' }, { field: 'status_category', operator: 'is_not', value: 'solved' }] }, groupBy: 'statusCategory', countKey: 'mine' },
    { slug: 'meus-nao-resolvidos' },
  ),
  helpdeskView(
    { id: 'unassigned', name: 'Tickets não atribuídos', conditions: { all: [{ field: 'assignee', operator: 'not_present' }, { field: 'status_category', operator: 'is_not', value: 'solved' }] }, countKey: 'unassigned' },
    { slug: 'nao-atribuidos' },
  ),
  helpdeskView(
    { id: 'all-unsolved', name: 'Todos os tickets sem resolução', conditions: { all: [{ field: 'status_category', operator: 'is_not', value: 'solved' }] }, groupBy: 'statusCategory', countKey: 'all-unsolved' },
    { slug: 'nao-resolvidos' },
  ),
  // `updated_at` não é filtrável no backend: avaliação local.
  helpdeskView({ id: 'recent', name: 'Tickets atualizados recentemente', conditions: { all: [{ field: 'updated_within_hours', operator: 'less_than', value: '72' }] }, countKey: 'recent' }),
  helpdeskView(
    { id: 'pending', name: 'Tickets pendentes', conditions: { all: [{ field: 'status_category', operator: 'is', value: 'pending' }] }, countKey: 'pending' },
    { query: { status: 'pending_customer' } },
  ),
  helpdeskView({
    id: 'solved-recent',
    name: 'Tickets resolvidos recentemente',
    conditions: { all: [{ field: 'status_category', operator: 'is', value: 'solved' }, { field: 'updated_within_hours', operator: 'less_than', value: '168' }] },
    countKey: 'solved-recent',
  }),
];

/** Visões do sistema do backend (`?view=<slug>`) sem par nas 6 do Helpdesk. Avaliadas NO SERVIDOR (`query`). */
const SYSTEM_EXTRA: [slug: string, name: string][] = [
  ['todos', 'Todos os tickets'],
  ['sem-atendimento', 'Sem primeira resposta'],
  ['aguardando-voce', 'Aguardando você'],
  ['mencionam-voce', 'Mencionam você'],
  ['resolvidos', 'Todos os tickets resolvidos'],
  ['internos', 'Abertos pela equipe (internos)'],
  ['em-kanban', 'Com prazo interno no quadro'],
];

export const SYSTEM_EXTRA_VIEWS: ViewDef[] = SYSTEM_EXTRA.map(([slug, name]) => ({
  view: { id: `sys:${slug}`, name, conditions: { all: [] }, columns: COLS, countKey: `sys:${slug}`, query: { view: slug }, origin: 'system' },
  serverCount: { slug },
}));

/** Visão pessoal (`/ticket-views/`): os `filters` planos viram a `query` do servidor; a lista é sempre do servidor. */
export function mapPersonalView(dto: PersonalViewDto): View {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(dto.filters ?? {})) if (v !== '' && v != null) query[k] = String(v);
  return { id: `pv:${dto.id}`, name: dto.name, conditions: { all: [] }, columns: COLS, countKey: `pv:${dto.id}`, query, origin: 'personal' };
}

/** Id do backend de uma visão pessoal (`pv:12` -> 12). */
export const personalViewId = (viewId: string): number | null => (/^pv:\d+$/.test(viewId) ? Number(viewId.slice(3)) : null);

/** Contadores que o servidor responde sem custo extra: `resumo.visoes` (visões do sistema) e `count` das visões pessoais. */
export function countsFromSummary(defs: ViewDef[], summary: SummaryDto | null, personal: PersonalViewDto[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of defs) {
    const slug = d.serverCount?.slug;
    if (slug && summary && typeof summary.visoes[slug] === 'number') out[d.view.countKey] = summary.visoes[slug]!;
  }
  for (const p of personal) if (typeof p.count === 'number') out[`pv:${p.id}`] = p.count;
  return out;
}
