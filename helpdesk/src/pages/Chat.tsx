import { EmptyState } from '@/components/ui';

/** Provisório: a tela é construída em seguida. */
export default function Chat() {
  return (
    <section aria-label="Chat" className="flex h-full flex-col px-6 pt-5">
      <h1 className="text-xl font-normal text-fg">Chat</h1>
      <p className="mt-1 text-sm text-fg-muted">Atendimento por chat em tempo real.</p>
      <EmptyState illustration="box" title="Em construção" description="Esta tela está sendo construída." />
    </section>
  );
}
