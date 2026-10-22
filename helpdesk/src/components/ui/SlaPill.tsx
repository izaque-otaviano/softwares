import { Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { slaDisplay } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import type { SlaState } from '@/types/domain';

export type SlaTarget = 'first_reply' | 'resolution';

export interface SlaPillProps {
  /** Vencimento (ISO). */
  dueAt: string;
  /** Estado vindo dos dados; só `met` é respeitado, o resto é derivado do relógio (verde, âmbar, vermelho). */
  state: SlaState;
  /** Relógio fixo (testes, impressão). Quando informado a pílula não atualiza sozinha. */
  now?: Date;
  /** Atualiza a cada 30 s via `useNow`. Padrão: true. */
  live?: boolean;
  /** Versão densa para tabelas e listas: 10px, sem folga extra. */
  compact?: boolean;
  /** Qual meta é: entra no `aria-label` ("SLA de primeira resposta: 49m restantes"). */
  target?: SlaTarget;
  className?: string;
}

const TARGET_LABEL: Record<SlaTarget, string> = {
  first_reply: 'SLA de primeira resposta',
  resolution: 'SLA de resolução',
};

const TONE: Record<SlaState, string> = {
  ok: 'bg-sla-bg text-sla-text',
  met: 'bg-sla-bg text-sla-text',
  warning: 'bg-sla-warn text-sla-warnText',
  breached: 'bg-sla-breach text-sla-breachText',
};

const REFRESH_MS = 30_000;

function ariaLabelFor(prefix: string, state: SlaState, label: string): string {
  if (state === 'met') return `${prefix}: cumprido`;
  if (state === 'breached') return `${prefix}: ${label.charAt(0).toLocaleLowerCase('pt-BR')}${label.slice(1)}`;
  return `${prefix}: ${label} restantes`;
}

/** Contagem regressiva de SLA. Verde, depois âmbar (faltando 60 min ou menos), depois vermelho ao estourar. */
export function SlaPill({ dueAt, state, now, live = true, compact = false, target, className }: SlaPillProps) {
  // Com `now` fixo, ou SLA cumprido, não há o que atualizar: sem timer.
  const tick = useNow(live && !now && state !== 'met' ? REFRESH_MS : 0);
  const display = slaDisplay(dueAt, state, now ?? tick);
  const prefix = target ? TARGET_LABEL[target] : 'SLA';
  const ariaLabel = ariaLabelFor(prefix, display.state, display.label);

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      title={ariaLabel}
      data-sla-state={display.state}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-pill font-semibold',
        compact ? 'h-4 gap-0.5 px-1.5 text-2xs' : 'h-5 gap-1 px-2 text-xs',
        TONE[display.state],
        className,
      )}
    >
      <Clock aria-hidden className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      <span>{display.label}</span>
    </span>
  );
}
