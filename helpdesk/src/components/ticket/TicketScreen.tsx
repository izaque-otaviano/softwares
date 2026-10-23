import { useEffect, type KeyboardEvent } from 'react';
import { Banner } from '@/components/ui';
import { SETTINGS_MANAGE, useCan } from '@/lib/permissions';
import { absoluteTime } from '@/lib/time';
import { useTickets } from '@/store/useTickets';
import { useIsNarrow } from '@/lib/useMediaQuery';
import { BottomBar } from './BottomBar';
import { CloseResolutionModal } from './CloseResolutionModal';
import { Composer } from './Composer';
import { RequiredFieldsDialog } from './RequiredFieldsDialog';
import { Conversation } from './Conversation';
import { isNewKey, ticketIdFromKey, useFormEntry, useFormStore } from './formStore';
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
 * Ticket apagado (exclusão lógica): só o administrador chega aqui (para os demais o servidor responde 404). Mostra quando
 * e por quem foi apagado e oferece restaurar (até 30 dias depois); enquanto estiver apagado o ticket é só leitura.
 */
function DeletedBanner({ ticketKey }: { ticketKey: string }) {
  const id = ticketIdFromKey(ticketKey);
  const ticket = useTickets((s) => s.tickets.find((t) => t.id === id));
  const canRestore = useCan(SETTINGS_MANAGE);
  if (!ticket?.deletedAt) return null;
  return (
    <Banner
      tone="warning"
      title={`Apagado em ${absoluteTime(ticket.deletedAt)}${ticket.deletedByName ? ` por ${ticket.deletedByName}` : ''}`}
      className="m-3 shrink-0"
      onRetry={canRestore ? () => void useTickets.getState().restoreTicket(ticket.id) : undefined}
      retryLabel="Restaurar"
    >
      Este ticket não aparece em listas, buscas nem relatórios e está somente para leitura. {canRestore ? 'Restaure-o para voltar a trabalhar nele (só é possível em até 30 dias depois de apagar).' : ''}
    </Banner>
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
  const narrow = useIsNarrow();

  // Ticket novo: ao escolher o solicitante, o painel direito abre no cartão do cliente (com histórico).
  useEffect(() => {
    // Em telas estreitas o painel é Drawer: não abre sozinho.
    if (isNew && requesterId && !narrow) useRightPanel.setState({ open: 'customer' });
  }, [isNew, requesterId, narrow]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Captura: roda antes do Tiptap, cujo Mod-Enter insere quebra de linha. Ignora portais (modais) filhos na árvore React.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.currentTarget.contains(e.target as Node)) {
      e.preventDefault();
      e.stopPropagation();
      void useFormStore.getState().submit(ticketKey);
    }
  };

  const deleted = useTickets((s) => (isNew ? false : Boolean(s.tickets.find((t) => t.id === ticketIdFromKey(ticketKey))?.deletedAt)));
  if (!entry) return null;
  const commentError = entry.errors.comment;
  const fieldsError = entry.errors.fields;

  return (
    <div onKeyDownCapture={onKeyDown} className="flex h-full min-h-0 flex-col overflow-hidden bg-surface" data-testid="ticket-screen">
      <SubTabs ticketKey={ticketKey} />
      <div className="flex min-h-0 flex-1">
        <PropertiesPanel ticketKey={ticketKey} />
        <section aria-label={isNew ? 'Novo ticket' : 'Conversa'} className="flex min-w-0 flex-1 flex-col">
          <DeletedBanner ticketKey={ticketKey} />
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
          {fieldsError ? (
            <Banner tone="warning" className="m-3 shrink-0" onDismiss={() => useFormStore.getState().clearErrors(ticketKey)}>
              {fieldsError}
            </Banner>
          ) : null}
          {isNew ? (
            <>
              <h1 className="sr-only">Novo ticket</h1>
              <SubjectField ticketKey={ticketKey} />
              <div className="min-h-0 flex-1" />
            </>
          ) : (
            <Conversation ticketKey={ticketKey} />
          )}
          {deleted ? null : <Composer ticketKey={ticketKey} />}
        </section>
        <TicketRightRail ticketKey={ticketKey} />
      </div>
      <BottomBar ticketKey={ticketKey} />
      <CloseResolutionModal />
      <RequiredFieldsDialog />
    </div>
  );
}
