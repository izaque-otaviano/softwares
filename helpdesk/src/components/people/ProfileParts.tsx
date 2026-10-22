import { useEffect, useRef, type ReactNode } from 'react';
import { Banner, Button, EmptyState, Skeleton } from '@/components/ui';
import { tabbableElements } from '@/components/ui/focusUtils';
import { absoluteTime } from '@/lib/time';

/** Coluna de propriedades à esquerda dos perfis (largura `props`, rolagem própria). */
export function PropertiesAside({ label, children, footer }: { label: string; children: ReactNode; footer?: ReactNode }) {
  const asideRef = useRef<HTMLElement>(null);
  const footerHadFocus = useRef(false);
  const hasFooter = Boolean(footer);

  // O rodapé (Salvar/Descartar) some quando não há alterações: se o foco estava nele, leva-o ao primeiro campo em vez de perdê-lo.
  useEffect(() => {
    if (hasFooter || !footerHadFocus.current) return;
    footerHadFocus.current = false;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    tabbableElements(asideRef.current ?? document)[0]?.focus();
  }, [hasFooter]);

  return (
    <aside ref={asideRef} aria-label={label} className="flex h-full w-props shrink-0 flex-col border-r border-line bg-surface-1">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      {footer ? (
        <div
          onFocusCapture={() => {
            footerHadFocus.current = true;
          }}
          onBlurCapture={(e) => {
            if (e.relatedTarget) footerHadFocus.current = false;
          }}
          className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3"
        >
          {footer}
        </div>
      ) : null}
    </aside>
  );
}

export function Stamps({ items }: { items: { label: string; iso?: string }[] }) {
  return (
    <dl className="space-y-1 border-t border-line pt-3 text-xs text-fg-muted">
      {items.map((s) => (
        <div key={s.label} className="flex justify-between gap-2">
          <dt>{s.label}</dt>
          <dd className="text-fg">{s.iso ? absoluteTime(s.iso) : '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProfileSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex h-full">
      <div className="w-props shrink-0 space-y-4 border-r border-line bg-surface-1 p-4">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton width={72} />
            <Skeleton className="h-8" width="100%" />
          </div>
        ))}
      </div>
      <div className="flex-1 space-y-4 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-pill" />
          <Skeleton className="h-6" width={220} />
        </div>
        <Skeleton className="h-8" width="100%" />
        <Skeleton className="h-24" width="100%" />
      </div>
    </div>
  );
}

export function ProfileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-6">
      <Banner tone="error" title="Não foi possível carregar" onRetry={onRetry}>
        {message}
      </Banner>
    </div>
  );
}

export function ProfileNotFound({ title, description, onBack, backLabel }: { title: string; description: string; onBack: () => void; backLabel: string }) {
  return (
    <EmptyState
      illustration="search"
      title={title}
      description={description}
      action={
        <Button variant="primary" onClick={onBack}>
          {backLabel}
        </Button>
      }
    />
  );
}
