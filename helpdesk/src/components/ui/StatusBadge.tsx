import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { statusInkColor, statusSoftColor } from '@/lib/status';
import type { TicketStatus } from '@/types/domain';

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

/** Único jeito de pintar um status: pílula suave (fundo claro e texto no tom forte do mesmo status), 12/600. */
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
        resolvedColor === undefined && 'bg-ink text-fg-inverse',
        className,
      )}
      style={resolvedColor === undefined ? style : { ...style, backgroundColor: statusSoftColor(resolvedColor), color: statusInkColor(resolvedColor) }}
    >
      <span className="truncate">{visible}</span>
    </span>
  );
}
