import { forwardRef, useEffect, useMemo, useRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { mergeRefs } from './fieldUtils';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange' | 'type' | 'size' | 'defaultChecked'> {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Checkbox nativo estilizado (16x16). O contêiner é um `<label>`: o rótulo e a área de 24x24 ao redor
 * do quadrado são clicáveis. Sem `label`, passe `aria-label`. `className` vai para o `<label>`.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, onCheckedChange, label, disabled, className, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const ref = useMemo(() => mergeRefs(forwardedRef, innerRef), [forwardedRef]);
  const indeterminate = checked === 'indeterminate';

  // `indeterminate` só existe como propriedade do DOM; o navegador a zera ao clicar, então reaplica a cada render.
  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  });

  return (
    <label
      className={cn(
        'inline-flex min-h-6 items-center text-sm',
        disabled ? 'cursor-not-allowed text-fg-subtle' : 'cursor-pointer text-fg',
        className,
      )}
    >
      <span className="relative grid size-6 shrink-0 place-items-center">
        <input
          {...rest}
          ref={ref}
          type="checkbox"
          checked={checked === true}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="peer size-4 cursor-pointer appearance-none rounded border border-fg-subtle bg-surface transition-colors duration-100 checked:border-action checked:bg-action indeterminate:border-action indeterminate:bg-action focus-visible:shadow-focus enabled:hover:border-action disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-1 disabled:checked:border-fg-subtle disabled:checked:bg-fg-subtle disabled:indeterminate:border-fg-subtle disabled:indeterminate:bg-fg-subtle"
        />
        <Check
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none absolute size-3 text-fg-inverse opacity-0 peer-checked:opacity-100"
        />
        <Minus
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none absolute size-3 text-fg-inverse opacity-0 peer-indeterminate:opacity-100"
        />
      </span>
      {label ? <span className="select-none pr-1">{label}</span> : null}
    </label>
  );
});
