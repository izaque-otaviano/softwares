import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { EmptyIllustration, type EmptyIllustrationName } from './EmptyIllustrations';

export interface EmptyStateProps {
  /** Padrão: 'box'. */
  illustration?: EmptyIllustrationName;
  title: string;
  description?: ReactNode;
  /** Normalmente um Button (CTA). Centralizado abaixo do texto. */
  action?: ReactNode;
  /** Menos espaçamento e ilustração menor: para cartões, painéis laterais e células de tabela. */
  compact?: boolean;
  className?: string;
}

/** Estado vazio: ilustração de traço fino cinza + título + frase + CTA opcional. */
export function EmptyState({ illustration = 'box', title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'gap-1 px-4 py-6' : 'gap-2 px-6 py-12', className)}>
      <EmptyIllustration name={illustration} size={compact ? 64 : 96} className={cn('text-fg-subtle', compact ? 'mb-1' : 'mb-2')} />
      <p className={cn('font-semibold text-fg', compact ? 'text-sm' : 'text-md')}>{title}</p>
      {description ? <div className="max-w-sm text-sm text-fg-muted">{description}</div> : null}
      {action ? <div className={cn('flex justify-center', compact ? 'mt-2' : 'mt-3')}>{action}</div> : null}
    </div>
  );
}
