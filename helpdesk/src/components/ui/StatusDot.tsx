import { cn } from '@/lib/cn';
import { statusColor } from '@/lib/status';

export type Presence = 'available' | 'away' | 'offline';

export const PRESENCE_LABEL: Record<Presence, string> = {
  available: 'Disponível',
  away: 'Ausente',
  offline: 'Offline',
};

const PRESENCE_CLASS: Record<Presence, string> = {
  available: 'bg-sla-text',
  // note.badge sobre surface tem só 2,0:1: o contorno de 1px em note.badgeText (dentro dos 10px) leva o ponto a >= 3:1.
  away: 'border border-note-badgeText bg-note-badge',
  offline: 'bg-fg-subtle',
};

export interface StatusDotProps {
  /** Chave de token de status (`new`, `open`, `hold`, `pending`, `solved`) ou cor de status personalizado. */
  color?: string;
  /** Presença do agente. Ignorada quando `color` é informado. */
  presence?: Presence;
  /** Texto só para leitor de tela. Sem `label` o ponto é decorativo (aria-hidden). */
  label?: string;
  className?: string;
}

/** Ponto 10 x 10 com raio 2. Cor de status sempre via `statusColor`, nunca hex direto. */
export function StatusDot({ color, presence, label, className }: StatusDotProps) {
  const fallback = color === undefined ? PRESENCE_CLASS[presence ?? 'offline'] : undefined;
  return (
    <span
      aria-hidden={label ? undefined : true}
      data-presence={presence}
      className={cn('relative inline-block h-2.5 w-2.5 shrink-0 rounded-full', fallback, className)}
      style={color === undefined ? undefined : { backgroundColor: statusColor(color) }}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
