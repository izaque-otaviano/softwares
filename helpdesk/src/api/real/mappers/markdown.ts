import { Marked } from 'marked';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import type { MentionDto } from './dto';

/** Marcação de menção do backend: `@[user:12]` / `@[team:3]` (só em nota interna). */
const MENTION = /@\[((?:user|team):\d+)\]/g;

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * O backend renderiza o corpo como árvore React (nunca HTML): `<b>` digitado aparece como TEXTO. Mantém essa
 * semântica: HTML cru do markdown é escapado (e, por cima, tudo ainda passa pelo `sanitizeHtml`).
 */
const md = new Marked({ gfm: true, breaks: true, async: false, renderer: { html: (token) => escapeHtml(token.text) } });

/**
 * Corpo de mensagem/macro do Resolv (markdown leve) -> HTML SEGURO para exibir na conversa.
 * O backend guarda markdown; o Helpdesk (Tiptap/HTML) converte nas bordas. Todo HTML (inclusive o que o próprio
 * markdown permite) passa pelo `sanitizeHtml` (lista branca de tags, `href` só http/https/mailto/tel).
 */
export function markdownToHtml(markdown: string, mentions: MentionDto[] = []): string {
  if (!markdown) return '';
  const names = new Map(mentions.map((m) => [m.key, m.name]));
  const withMentions = markdown.replace(MENTION, (_all, key: string) => `**@${names.get(key) ?? (key.startsWith('team') ? 'equipe' : 'usuário')}**`);
  const html = md.parse(withMentions) as string;
  return sanitizeHtml(html).trim();
}
