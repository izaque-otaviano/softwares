import { User } from 'lucide-react';
import { useState, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { PRESENCE_LABEL, StatusDot, type Presence } from './StatusDot';

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  name?: string;
  /** URL da foto. Se falhar ao carregar, cai para iniciais ou silhueta. */
  src?: string;
  /** Diâmetro em px. Padrão 32. */
  size?: number;
  presence?: Presence;
  /** Use quando o nome já aparece em texto ao lado: esconde o avatar (e a presença) dos leitores de tela. */
  decorative?: boolean;
}

/**
 * Paleta FECHADA para o fundo das iniciais (texto branco `fg-inverse`).
 * Só tokens existentes; todos com contraste >= 4,5:1 com branco (Avatar.test.tsx recalcula a partir do tailwind.config).
 * Classes escritas por extenso para o Tailwind enxergá-las. `ai` (4,46:1) e `danger` ficaram de fora: o primeiro reprova AA,
 * o segundo lê como alerta.
 *   action 5,01 · action.hover 7,37 · sla.text 10,10 · sla.warnText 7,41 · sla.breachText 8,75 · ink 10,10 · note.badgeText 12,50
 */
export const AVATAR_PALETTE = [
  { token: 'action', className: 'bg-action' },
  { token: 'action.hover', className: 'bg-action-hover' },
  { token: 'sla.text', className: 'bg-sla-text' },
  { token: 'sla.warnText', className: 'bg-sla-warnText' },
  { token: 'sla.breachText', className: 'bg-sla-breachText' },
  { token: 'ink', className: 'bg-ink' },
  { token: 'note.badgeText', className: 'bg-note-badgeText' },
] as const;

/** FNV-1a de 32 bits: estável entre execuções e plataformas. */
function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Índice da cor na paleta para um nome. Ignora caixa e espaços nas pontas. */
export function avatarColorIndex(name: string): number {
  return hashString(name.trim().toLocaleLowerCase('pt-BR')) % AVATAR_PALETTE.length;
}

const FIRST_LETTER = /\p{L}/u;

/** Até 2 iniciais: primeira letra da primeira e da última palavra. Vazio se o nome não tiver nenhuma letra. */
export function initialsOf(name: string | undefined): string {
  if (!name) return '';
  const letters = name
    .trim()
    .split(/\s+/)
    .map((word) => Array.from(word).find((ch) => FIRST_LETTER.test(ch)))
    .filter((ch): ch is string => ch !== undefined);
  if (letters.length === 0) return '';
  const picked = letters.length === 1 ? [letters[0]!] : [letters[0]!, letters[letters.length - 1]!];
  return picked.join('').toLocaleUpperCase('pt-BR');
}

function fontClass(size: number): string {
  if (size <= 24) return 'text-2xs';
  if (size <= 32) return 'text-xs';
  if (size <= 40) return 'text-sm';
  if (size <= 56) return 'text-md';
  return 'text-xl';
}

/** Círculo com foto, iniciais sobre cor derivada do nome, ou silhueta cinza quando não há nem foto nem iniciais. */
export function Avatar({ name, src, size = 32, presence, decorative = false, className, style, ...rest }: AvatarProps) {
  // Guarda a URL que falhou (e não um booleano): trocar `src` volta a tentar a foto sem efeito de reset.
  const [failedSrc, setFailedSrc] = useState<string | undefined>();

  const initials = initialsOf(name);
  const showPhoto = Boolean(src) && failedSrc !== src;
  const color = initials ? AVATAR_PALETTE[avatarColorIndex(name ?? '')]! : undefined;

  const accessibleName = [name?.trim() || 'Usuário sem nome', presence ? PRESENCE_LABEL[presence] : undefined]
    .filter(Boolean)
    .join(', ');

  return (
    <span
      {...rest}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : accessibleName}
      aria-hidden={decorative ? true : undefined}
      className={cn('relative inline-flex shrink-0 select-none', className)}
      style={{ ...style, width: size, height: size }}
    >
      <span
        className={cn(
          'flex h-full w-full items-center justify-center overflow-hidden rounded-pill font-semibold',
          showPhoto ? 'bg-surface-2' : color ? [color.className, 'text-fg-inverse'] : 'bg-surface-2 text-fg-muted',
          fontClass(size),
        )}
      >
        {showPhoto ? (
          <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
        ) : initials ? (
          <span data-avatar-color={color?.token}>{initials}</span>
        ) : (
          <User aria-hidden size={Math.round(size * 0.55)} data-avatar-silhouette="" />
        )}
      </span>
      {presence ? (
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex rounded-xs border-2 border-surface bg-surface">
          <StatusDot presence={presence} />
        </span>
      ) : null}
    </span>
  );
}
