import { localHint } from '@/api/capabilities';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDirectory } from '@/components/lists/useDirectory';
import { Skeleton } from '@/components/ui';
import { useNow } from '@/lib/useNow';
import { useTickets } from '@/store/useTickets';
import type { AuditEvent, Comment, Ticket } from '@/types/domain';
import { ConversationHeader, type ConversationFilter } from './ConversationHeader';
import { EventRow } from './EventsLog';
import { ticketIdFromKey } from './formStore';
import { MessageBubble } from './MessageBubble';

type Item = { type: 'comment'; at: number; comment: Comment } | { type: 'event'; at: number; event: AuditEvent };

/** Mensagens (filtradas) e, se ligado, eventos do sistema, em ordem cronológica. */
export function buildTimeline(ticket: Ticket, filter: ConversationFilter, showEvents: boolean): Item[] {
  const items: Item[] = [];
  for (const comment of ticket.comments) {
    if (filter === 'public' && !comment.public) continue;
    if (filter === 'internal' && comment.public) continue;
    items.push({ type: 'comment', at: Date.parse(comment.createdAt), comment });
  }
  if (showEvents) for (const event of ticket.events) items.push({ type: 'event', at: Date.parse(event.createdAt), event });
  return items.sort((a, b) => a.at - b.at);
}

function mockSummary(ticket: Ticket, requester?: string): string {
  const f = ticket.customFields;
  const parts = [`${requester ?? 'O cliente'} entrou em contato${ticket.channel === 'email' ? ' por e-mail' : ' pelo formulário web'}`];
  if (f.resumo) parts[0] += `: ${f.resumo.replace(/[.…]+$/, '')}.`;
  else parts[0] += '.';
  if (f.topico) parts.push(`Tópico identificado: ${f.topico}.`);
  if (f.sentimento) parts.push(`Sentimento ${f.sentimento.toLowerCase()}.`);
  parts.push(`${ticket.comments.length} ${ticket.comments.length === 1 ? 'mensagem' : 'mensagens'} na conversa.`);
  return parts.join(' ');
}

function ConversationSkeleton() {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-hidden px-6 py-4" data-testid="conversation-skeleton" aria-busy="true" aria-label="Carregando conversa">
      <Skeleton className="h-5 w-2/3" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-pill" />
          <Skeleton className="h-20 flex-1" />
        </div>
      ))}
    </div>
  );
}

export function Conversation({ ticketKey }: { ticketKey: string }) {
  const id = ticketIdFromKey(ticketKey);
  const ticket = useTickets((s) => s.tickets.find((t) => t.id === id));
  const users = useDirectory();
  const now = useNow(30_000);
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [showEvents, setShowEvents] = useState(false);
  const [compact, setCompact] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const items = useMemo(() => (ticket ? buildTimeline(ticket, filter, showEvents) : []), [ticket, filter, showEvents]);
  const commentCount = ticket?.comments.length ?? 0;

  // Ancora no fim ao abrir e quando chega/é enviada uma mensagem.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [commentCount, ticket?.id, Boolean(ticket)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ticket) return <ConversationSkeleton />;
  const requester = users.get(ticket.requesterId);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="conversation">
      <ConversationHeader
        ticket={ticket}
        filter={filter}
        onFilterChange={setFilter}
        showEvents={showEvents}
        onToggleEvents={() => setShowEvents((v) => !v)}
        compact={compact}
        onToggleCompact={() => setCompact((v) => !v)}
      />
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-6 pb-4" data-testid="conversation-scroll">
        <button
          type="button"
          aria-expanded={summaryOpen}
          onClick={() => setSummaryOpen((v) => !v)}
          className="mb-3 inline-flex items-center gap-1 rounded-xs text-sm text-action outline-none hover:text-action-hover focus-visible:shadow-focus"
        >
          {summaryOpen ? <ChevronDown aria-hidden className="h-4 w-4" /> : <ChevronRight aria-hidden className="h-4 w-4" />}
          {summaryOpen ? 'Ocultar resumo do ticket' : 'Exibir resumo do ticket'}
        </button>
        {summaryOpen ? (
          <section aria-label="Resumo do ticket" className="mb-4 rounded border border-line bg-surface-1 p-3 text-sm text-fg">
            <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ai">
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              Resumo gerado por IA{localHint('aiSummary') ? ' (somente neste navegador)' : ''}
            </p>
            <p>{mockSummary(ticket, requester?.name)}</p>
          </section>
        ) : null}
        {items.length === 0 ? <p className="py-6 text-center text-sm text-fg-muted">Nenhuma mensagem neste filtro.</p> : null}
        <div className="space-y-4">
          {items.map((it) =>
            it.type === 'comment' ? (
              <MessageBubble
                key={it.comment.id}
                comment={it.comment}
                author={users.get(it.comment.authorId)}
                isCustomer={it.comment.authorId === ticket.requesterId}
                now={now}
                compact={compact}
              />
            ) : (
              <EventRow key={it.event.id} event={it.event} now={now} fields={ticket.customFields} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
