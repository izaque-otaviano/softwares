import type { ReactNode } from 'react';
import { Banner, Skeleton } from '@/components/ui';

/** Carregando, erro (com "Tentar novamente") ou o conteúdo. Com dados antigos na tela, a recarga só marca `aria-busy`. */
export function Async({ loading, error, hasData, onRetry, children }: { loading: boolean; error?: string; hasData: boolean; onRetry: () => void; children: ReactNode }) {
  if (error) {
    return (
      <Banner tone="error" title="Não foi possível carregar o relatório" onRetry={onRetry}>
        {error}
      </Banner>
    );
  }
  if (!hasData) {
    return (
      <div role="status" aria-live="polite" aria-label="Carregando o relatório" className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={92} className="rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton height={280} className="rounded-lg" />
          <Skeleton height={280} className="rounded-lg" />
        </div>
      </div>
    );
  }
  return (
    <div aria-busy={loading} className={loading ? 'opacity-60 transition-opacity duration-100' : undefined}>
      {children}
    </div>
  );
}
