import { EmptyState } from '@/components/ui';

/** Provisório: a tela é construída em seguida. */
export default function Reports() {
  return (
    <section aria-label="Relatórios" className="flex h-full flex-col px-6 pt-5">
      <h1 className="text-xl font-normal text-fg">Relatórios</h1>
      <p className="mt-1 text-sm text-fg-muted">Métricas de tickets e de chat.</p>
      <EmptyState illustration="box" title="Em construção" description="Esta tela está sendo construída." />
    </section>
  );
}
