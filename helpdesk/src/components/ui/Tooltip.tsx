import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={300} skipDelayDuration={200}>
    {children}
  </RadixTooltip.Provider>
);

export interface TooltipProps {
  content: ReactNode;
  /** Elemento que dispara o tooltip. Precisa aceitar `ref` e props de DOM (use `asChild` por baixo). */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Atalho exibido ao lado do texto, ex.: "g h". */
  shortcut?: string;
  disabled?: boolean;
  className?: string;
}

/** Pílula escura. Fecha com Esc e some ao tirar o foco/ponteiro (comportamento do Radix). */
export function Tooltip({ content, children, side = 'bottom', align = 'center', shortcut, disabled, className }: TooltipProps) {
  if (disabled || content == null || content === '') return children;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'anim-fade-in z-[70] max-w-64 rounded-pill bg-ink-active px-2.5 py-1 text-xs text-fg-inverse shadow-pop',
            className,
          )}
        >
          <span>{content}</span>
          {shortcut ? <kbd className="ml-2 font-sans text-2xs opacity-70">{shortcut}</kbd> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
