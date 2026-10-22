import { cloneElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label: ReactNode;
  /** Texto de apoio abaixo do campo. */
  hint?: ReactNode;
  /** Mensagem de erro. Também marca o campo como inválido. */
  error?: ReactNode;
  required?: boolean;
  /** Conteúdo à direita do rótulo, na mesma linha (ex.: o link "aceitar"). */
  labelAction?: ReactNode;
  /** Um único controle (Input, Textarea, Select, Combobox, TagInput ou elemento DOM). */
  children: ReactElement;
  className?: string;
}

interface ControlProps {
  id?: string;
  invalid?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

const hasContent = (node: ReactNode): boolean => node !== undefined && node !== null && node !== false && node !== '';

/**
 * Rótulo + controle + dica + erro. Gera os ids e liga tudo ao filho com `cloneElement`:
 * `id` (para o `<label htmlFor>`), `aria-describedby` (dica e erro), `aria-invalid` e `aria-required`.
 * O erro vive numa região `aria-live="polite"` que existe antes da mensagem, para ser anunciado.
 */
export function Field({ label, hint, error, required, labelAction, children, className }: FieldProps) {
  const baseId = useId();
  const control = children as ReactElement<ControlProps>;
  const controlId = control.props.id ?? `${baseId}-control`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;

  const hasHint = hasContent(hint);
  const hasError = hasContent(error);

  const describedBy =
    [control.props['aria-describedby'], hasHint ? hintId : undefined, hasError ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  // Componentes do kit entendem `invalid`; elementos DOM só entendem `aria-invalid`.
  const isDom = typeof control.type === 'string';
  const invalidProps: ControlProps = hasError ? (isDom ? { 'aria-invalid': true } : { invalid: true }) : {};

  const enhanced = cloneElement(control, {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-required': required ? true : control.props['aria-required'],
    ...invalidProps,
  });

  return (
    <div className={cn('block', className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={controlId} className="text-xs font-semibold text-fg">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
          ) : null}
        </label>
        {labelAction}
      </div>
      {enhanced}
      {hasHint ? (
        <p id={hintId} className="mt-1 text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
      <div aria-live="polite">
        {hasError ? (
          <p id={errorId} className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
