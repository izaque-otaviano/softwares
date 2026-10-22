import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange' | 'type' | 'size' | 'defaultChecked' | 'role'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Interruptor (trilho 32x20, botão 16). É um `<input type="checkbox" role="switch">` nativo, então Espaço alterna
 * e o estado chega aos leitores de tela. O contêiner é um `<label>` (área mínima de 24px). Sem `label`, passe `aria-label`.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, label, disabled, className, ...rest },
  ref,
) {
  return (
    <label
      className={cn(
        'inline-flex min-h-6 items-center gap-2 text-sm',
        disabled ? 'cursor-not-allowed text-fg-subtle' : 'cursor-pointer text-fg',
        className,
      )}
    >
      <span className="relative inline-flex h-5 w-8 shrink-0 items-center">
        <input
          {...rest}
          ref={ref}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="peer h-5 w-8 cursor-pointer appearance-none rounded-pill bg-fg-subtle transition-colors duration-100 checked:bg-action focus-visible:shadow-focus disabled:cursor-not-allowed disabled:bg-line-strong disabled:checked:bg-fg-subtle"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-pill bg-surface transition-transform duration-100 peer-checked:translate-x-3"
        />
      </span>
      {label ? <span className="select-none">{label}</span> : null}
    </label>
  );
});
