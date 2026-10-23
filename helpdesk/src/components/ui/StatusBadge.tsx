import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { isStatusColorKey, statusColor } from '@/lib/status';
import type { TicketStatus } from '@/types/domain';
import { AA_NORMAL, contrastWithWhite } from './colorContrast';

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'color' | 'children'> {
  /** Status completo; fornece nome (conforme `audience`) e cor. */
  status?: TicketStatus;
  /** Sobrescreve o nome vindo de `status`. */
  label?: string;
  /** Chave de token (`new`, `open`, `hold`, `pending`, `solved`) ou cor de status personalizado. Sobrescreve a de `status`. */
  color?: string;
  /** `agent` usa `agentName`; `end_user` usa `endUserName` (ex.: Pendente vira "Aguardando resposta"). */
  audience?: 'agent' | 'end_user';
  /** Mostra só a inicial (lista densa); o nome completo vai para `aria-label` e `title`. */
  compact?: boolean;
}

/**
 * Cor do texto sobre o fundo sólido do status. Regra do brief: texto branco.
 * Exceção por contraste: `status.new` (laranja claro) dá 2,10:1 com branco; usa `note.badgeText` (5,96:1).
 * Cores personalizadas em hex também caem para o texto escuro quando o branco ficaria abaixo de 4,5:1.
 */
function textClass(color: string | undefined): string {
  if (color === undefined) return 'text-fg-inverse';
  if (color === 'new') return 'text-note-badgeText';
  if (isStatusColorKey(color)) return 'text-fg-inverse';
  const ratio = contrastWithWhite(color);
  return Number.isNaN(ratio) || ratio >= AA_NORMAL ? 'text-fg-inverse' : 'text-note-badgeText';
}

/** Único jeito de pintar um status: fundo sólido via token, 12/600, raio 4. */
export function StatusBadge({ status, label, color, audience = 'agent', compact = false, className, style, ...rest }: StatusBadgeProps) {
  const resolvedColor = color ?? status?.color;
  const resolvedLabel = label ?? (status ? (audience === 'end_user' ? status.endUserName : status.agentName) : '');
  const visible = compact ? (Array.from(resolvedLabel)[0] ?? '').toLocaleUpperCase('pt-BR') : resolvedLabel;

  return (
    <span
      {...rest}
      role={compact ? 'img' : rest.role}
      aria-label={compact ? resolvedLabel : rest['aria-label']}
      title={compact ? resolvedLabel : rest.title}
      data-status-color={resolvedColor}
      className={cn(
        'inline-flex max-w-full items-center rounded-pill text-xs font-semibold',
        compact ? 'h-5 min-w-5 justify-center px-1' : 'px-2 py-0.5',
        resolvedColor === undefined && 'bg-ink',
        textClass(resolvedColor),
        className,
      )}
      style={resolvedColor === undefined ? style : { ...style, backgroundColor: statusColor(resolvedColor) }}
    >
      <span className="truncate">{visible}</span>
    </span>
  );
}
