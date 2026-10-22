import type { Macro, Priority } from '@/types/domain';
import type { MacroDto, TagDto } from './dto';
import { markdownToHtml } from './markdown';

const PRIORITIES: ReadonlySet<string> = new Set(['low', 'normal', 'high', 'urgent']);

/**
 * Macro do Resolv -> Macro. `body` (markdown) vira `actions.publicReply` em HTML sanitizado, pronto para o compositor.
 * Os marcadores do backend (`{{solicitante}}`, `{{empresa}}`) ficam no texto. `tags` (ids) viram nomes.
 * Não existem no backend: `actions.status`, `actions.internalNote`, `description`, `availableTo` e `usage7d`.
 */
export function mapMacro(dto: MacroDto, tags: TagDto[] = []): Macro {
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const addTags = dto.tags.map((id) => tagName.get(id)).filter((n): n is string => Boolean(n));
  return {
    id: String(dto.id),
    name: dto.name,
    availableTo: 'all',
    active: dto.is_active,
    usage7d: 0,
    bodyMarkdown: dto.body,
    actions: {
      publicReply: markdownToHtml(dto.body),
      priority: PRIORITIES.has(dto.priority) ? (dto.priority as Priority) : undefined,
      addTags: addTags.length ? addTags : undefined,
    },
  };
}
