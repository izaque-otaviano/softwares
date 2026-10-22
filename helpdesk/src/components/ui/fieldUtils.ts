import type { MutableRefObject, Ref, RefCallback } from 'react';
import { cn } from '@/lib/cn';

/**
 * Auxiliares compartilhados pelos campos de formulário (Input, Textarea, Select, Combobox, TagInput).
 * Concentram a "caixa de campo" do brief: borda line-strong, raio 4, fundo surface, foco = borda action + shadow-focus.
 * A altura (h-8 ou min-h-8) fica com quem usa.
 */
interface FieldStateOptions {
  invalid?: boolean;
  disabled?: boolean;
}

/**
 * Caixa cujo foco vem de um descendente (um `<input>` dentro de um contêiner).
 * Sem `w-full` de propósito: é um bloco flex e já ocupa a linha; assim um `w-48` do consumidor não perde a disputa de CSS
 * (o `cn` não usa tailwind-merge).
 */
export function fieldBoxWithin({ invalid, disabled }: FieldStateOptions): string {
  if (disabled) {
    return 'flex items-center rounded border border-line-strong bg-surface-1 text-sm text-fg-subtle cursor-not-allowed';
  }
  return cn(
    'flex items-center rounded border bg-surface text-sm text-fg transition-colors duration-100 focus-within:shadow-focus',
    invalid ? 'border-danger' : 'border-line-strong focus-within:border-action',
  );
}

/** Caixa cujo foco está no próprio elemento (textarea, gatilhos de Select/Combobox). */
export function fieldBoxSelf({ invalid, disabled }: FieldStateOptions): string {
  if (disabled) return 'border border-line-strong bg-surface-1 text-fg-subtle cursor-not-allowed';
  return cn(
    'border bg-surface text-fg transition-colors duration-100 focus-visible:shadow-focus data-[state=open]:shadow-focus',
    invalid ? 'border-danger' : 'border-line-strong focus-visible:border-action data-[state=open]:border-action',
  );
}

/** Junta refs (a encaminhada pelo consumidor + a interna do componente). */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as MutableRefObject<T | null>).current = node;
    }
  };
}

/** Minúsculas e sem acentos: "João" casa com "joao". */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
