import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { FormEvent, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { fieldBoxSelf, mergeRefs } from './fieldUtils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Borda de erro (danger) e `aria-invalid`. */
  invalid?: boolean;
  /** Cresce com o conteúdo (sem barra de rolagem) em vez de rolar. */
  autoGrow?: boolean;
  /** Linhas visíveis no mínimo. Padrão: 3. */
  minRows?: number;
}

/** Área de texto: mesma caixa dos demais campos, mas a altura acompanha as linhas. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, autoGrow = false, minRows = 3, className, disabled, onInput, rows, value, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = useMemo(() => mergeRefs(forwardedRef, innerRef), [forwardedRef]);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el || !autoGrow) return;
    el.style.height = 'auto';
    const content = el.scrollHeight;
    // jsdom (e elementos ocultos) reportam 0: deixa a altura natural das `rows`.
    if (content > 0) el.style.height = `${content + (el.offsetHeight - el.clientHeight)}px`;
  }, [autoGrow]);

  useLayoutEffect(resize, [resize, value]);

  const handleInput = (event: FormEvent<HTMLTextAreaElement>) => {
    resize();
    onInput?.(event);
  };

  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      rows={rows ?? minRows}
      disabled={disabled}
      aria-invalid={invalid ? true : rest['aria-invalid']}
      onInput={handleInput}
      className={cn(
        'block w-full rounded px-2 py-1.5 text-sm placeholder:text-fg-muted focus-visible:outline-none',
        fieldBoxSelf({ invalid, disabled }),
        autoGrow ? 'resize-none overflow-hidden' : 'resize-y',
        className,
      )}
    />
  );
});
