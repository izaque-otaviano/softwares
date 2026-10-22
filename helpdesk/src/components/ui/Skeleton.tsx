import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

type Dimension = number | string;

export interface SkeletonProps {
  className?: string;
  /** Número = px; string = qualquer unidade CSS (ex.: '60%'). */
  width?: Dimension;
  height?: Dimension;
  /** Bloco redondo (avatar). Sem `width`/`height` assume 32px. */
  circle?: boolean;
}

const hasUtility = (className: string | undefined, prefix: 'h' | 'w'): boolean =>
  new RegExp(`(^|\\s)(min-|max-)?(${prefix}|size)-`).test(className ?? '');

/**
 * Bloco de carregamento: cor chapada `surface-2`, sem gradiente e sem animação (brief §10: nada de gradientes nem de
 * movimento longo; só o Spinner, que é um indicador de progresso, gira). Decorativo (aria-hidden): quem anuncia
 * "Carregando..." é o wrapper `role="status"`.
 * Sem `height` (nem classe `h-*`) tem 12px, a altura de uma linha de texto; `circle` assume 32px.
 */
export function Skeleton({ className, width, height, circle = false }: SkeletonProps) {
  const style: CSSProperties = {
    width: width ?? (circle && !hasUtility(className, 'w') ? 32 : undefined),
    height: height ?? (hasUtility(className, 'h') ? undefined : circle ? 32 : 12),
  };
  return (
    <div
      aria-hidden
      data-skeleton=""
      className={cn('shrink-0 bg-surface-2', circle ? 'rounded-pill' : 'rounded', className)}
      style={style}
    />
  );
}

interface LoadingWrapperProps {
  /** Texto para leitor de tela. Padrão: "Carregando...". */
  label?: string;
}

export interface SkeletonTextProps extends LoadingWrapperProps {
  lines?: number;
  className?: string;
}

/** Parágrafo de carregamento: a última linha é mais curta. */
export function SkeletonText({ lines = 3, className, label = 'Carregando...' }: SkeletonTextProps) {
  return (
    <div role="status" className={cn('flex flex-col gap-2', className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

export interface SkeletonRowsProps extends LoadingWrapperProps {
  rows?: number;
  columns?: number;
  className?: string;
}

/** Larguras alternadas (determinísticas, sem layout shift entre renders) para parecer conteúdo real. */
const CELL_WIDTHS = ['70%', '45%', '85%', '60%'];

/**
 * Linhas de carregamento feitas de `div` (grade flex), para listas fora de uma `<table>`. Cada linha tem 40px, igual a uma
 * linha de dados. A `Table` NÃO usa isto: renderiza uma `<td>` real por coluna (alinhada ao colgroup e ao cabeçalho).
 */
export function SkeletonRows({ rows = 5, columns = 4, className, label = 'Carregando...' }: SkeletonRowsProps) {
  return (
    <div role="status" className={cn('flex flex-col', className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: Math.max(1, rows) }, (_, r) => (
        <div key={r} aria-hidden data-skeleton-row="" className="flex h-10 items-center gap-4 border-b border-line px-3">
          {Array.from({ length: Math.max(1, columns) }, (_, c) => (
            <div key={c} className="flex min-w-0 flex-1 items-center">
              <Skeleton width={CELL_WIDTHS[(r * 3 + c) % CELL_WIDTHS.length]} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
