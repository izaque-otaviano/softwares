import { Mail, Globe } from 'lucide-react';
import { SlaPill, StatusDot } from '@/components/ui';
import { relativeTime } from '@/lib/time';
import type { Ticket, TicketStatus, User } from '@/types/domain';

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HomeRowProps {
  ticket: Ticket;
  status?: TicketStatus;
  requester?: User;
  now: Date;
  onOpen: (t: Ticket) => void;
}

/** Linha-cartão da lista da Home: canal, “Solicitante | Assunto”, SLA, status + prévia e tempo relativo. */
export function HomeRow({ ticket, status, requester, now, onOpen }: HomeRowProps) {
  const last = ticket.comments[ticket.comments.length - 1];
  const preview = last ? stripHtml(last.bodyHtml) : '';
  const Icon = ticket.channel === 'email' ? Mail : Globe;
  const title = `${requester?.name ?? 'Solicitante'} | ${ticket.subject}`;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(ticket)}
        className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus"
      >
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-fg-muted" aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-fg">{title}</span>
            {ticket.sla ? <SlaPill dueAt={ticket.sla.dueAt} state={ticket.sla.state} target={ticket.sla.target} compact /> : null}
          </span>
          <span className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
            <StatusDot color={status?.color} label={status?.agentName} />
            <span className="shrink-0 text-fg">{status?.agentName ?? ticket.statusId}</span>
            {preview ? <span className="min-w-0 truncate">{preview}</span> : null}
          </span>
          <span className="mt-1 block text-xs text-fg-muted">
            {relativeTime(ticket.updatedAt, now)} | #{ticket.id}
          </span>
        </span>
      </button>
    </li>
  );
}
