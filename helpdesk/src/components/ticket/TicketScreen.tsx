import { useEffect, type KeyboardEvent } from 'react';
import { Banner } from '@/components/ui';
import { BottomBar } from './BottomBar';
import { Composer } from './Composer';
import { Conversation } from './Conversation';
import { isNewKey, useFormEntry, useFormStore } from './formStore';
import { useRightPanel } from './panels/panelState';
import { PropertiesPanel } from './PropertiesPanel';
import { TicketRightRail } from './RightRail';
import { SubTabs } from './SubTabs';

function SubjectField({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey)!;
  const error = entry.errors.subject;
  return (
    <div className="shrink-0 px-6 pt-4">
      <input
        aria-label="Assunto"
        aria-invalid={error ? true : undefined}
        placeholder="Assunto"
        value={entry.values.subject}
        disabled={entry.submitting}
        onChange={(e) => useFormStore.getState().patch(ticketKey, { subject: e.target.value })}
        className="h-10 w-full rounded border border-transparent bg-transparent px-2 text-md font-semibold text-fg outline-none transition-colors duration-100 placeholder:text-fg-subtle hover:bg-hover focus:border-action focus:bg-surface focus:shadow-focus aria-[invalid=true]:border-danger"
      />
      {error ? (
        <p role="alert" className="mt-1 px-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Tela do ticket (existente ou novo): SubTabs + [PropertiesPanel | centro | TicketRightRail] + BottomBar.
 * Altura total, sem rolagem de página. Ctrl/Cmd+Enter envia.
 */
export function TicketScreen({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey);
  const isNew = isNewKey(ticketKey);
  const requesterId = entry?.values.requesterId ?? null;

  // Ticket novo: ao escolher o solicitante, o painel direito abre no cartão do cliente (com histórico).
  useEffect(() => {
    if (isNew && requesterId) useRightPanel.setState({ open: 'customer' });
  }, [isNew, requesterId]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void useFormStore.getState().submit(ticketKey);
    }
  };

  if (!entry) return null;
  const commentError = entry.errors.comment;

  return (
    <div onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col overflow-hidden bg-surface" data-testid="ticket-screen">
      <SubTabs ticketKey={ticketKey} />
      <div className="flex min-h-0 flex-1">
        <PropertiesPanel ticketKey={ticketKey} />
        <section aria-label={isNew ? 'Novo ticket' : 'Conversa'} className="flex min-w-0 flex-1 flex-col">
          {entry.apiError ? (
            <Banner tone="error" title="Não foi possível enviar" className="m-3 shrink-0" onRetry={() => void useFormStore.getState().retry(ticketKey)}>
              {entry.apiError} O que você digitou foi mantido.
            </Banner>
          ) : null}
          {commentError ? (
            <Banner tone="warning" className="m-3 shrink-0" onDismiss={() => useFormStore.getState().clearErrors(ticketKey)}>
              {commentError}
            </Banner>
          ) : null}
          {isNew ? (
            <>
              <SubjectField ticketKey={ticketKey} />
              <div className="min-h-0 flex-1" />
            </>
          ) : (
            <Conversation ticketKey={ticketKey} />
          )}
          <Composer ticketKey={ticketKey} />
        </section>
        <TicketRightRail ticketKey={ticketKey} />
      </div>
      <BottomBar ticketKey={ticketKey} />
    </div>
  );
}
