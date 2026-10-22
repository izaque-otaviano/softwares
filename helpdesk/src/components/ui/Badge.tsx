import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'action' | 'danger' | 'note' | 'ai' | 'success';
export type BadgeSize = 'md' | 'sm';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** md = 12px/600 raio 4 (padrão). sm = 10px/600 raio 2, usado em selos como "Interno" e "Campo padrão". */
  size?: BadgeSize;
  children: ReactNode;
}

/**
 * Cada par texto/fundo tem contraste AA (verificado em Badge.test.tsx). Todos têm borda de 1px (transparente, exceto `ai`) para manter a mesma altura.
 * `ai` não tem token de fundo suave: usa o roxo `ai` a 10% sobre a superfície, texto `fg` e borda `ai`,
 * porque o texto roxo sobre branco (4,46:1) fica abaixo de 4,5:1.
 */
const TONE: Record<BadgeTone, string> = {
  neutral: 'border border-transparent bg-surface-2 text-fg',
  action: 'border border-transparent bg-action-soft text-action-hover',
  danger: 'border border-transparent bg-sla-breach text-sla-breachText',
  note: 'border border-transparent bg-note-badge text-note-badgeText',
  ai: 'border border-ai bg-ai/10 text-fg',
  success: 'border border-transparent bg-sla-bg text-sla-text',
};

const SIZE: Record<BadgeSize, string> = {
  md: 'rounded px-1.5 py-0.5 text-xs font-semibold',
  sm: 'rounded-xs px-1 py-px text-2xs font-semibold',
};

/** Selo informativo, não interativo. Sem gradiente e sem sombra. */
export function Badge({ tone = 'neutral', size = 'md', className, children, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      data-tone={tone}
      className={cn('inline-flex max-w-full items-center whitespace-nowrap', SIZE[size], TONE[tone], className)}
    >
      {children}
    </span>
  );
}
