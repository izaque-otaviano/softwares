import { Building2, User } from 'lucide-react';
import { useDirectory } from '@/components/lists/useDirectory';
import { goTo, openOrg, openUser } from '@/components/shell/openTab';
import { StatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { DEFAULT_STATUSES, TYPE_LABEL } from '@/lib/status';
import { useTickets } from '@/store/useTickets';
import { useFormEntry } from './formStore';
import { useOrgs } from './useTicketLookups';

const TAB =
  'inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus';

/** Sub-abas de contexto (40px): Organização · Cliente · [badge do status do FORM] Ticket #id. */
export function SubTabs({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey);
  const users = useDirectory();
  const orgs = useOrgs();
  const statuses = useTickets((s) => s.statuses);
  if (!entry) return null;
  const { values } = entry;
  const requester = values.requesterId ? users.get(values.requesterId) : undefined;
  const org = requester?.orgId ? orgs.find((o) => o.id === requester.orgId) : undefined;
  const status = (statuses.length ? statuses : DEFAULT_STATUSES).find((s) => s.id === values.statusId);
  const base = values.type ? TYPE_LABEL[values.type] : 'Ticket';
  const label = entry.ticketId ? `${base} #${entry.ticketId}` : base;

  return (
    <div role="tablist" aria-label="Contexto do ticket" className="flex h-10 shrink-0 items-end gap-1 border-b border-line bg-surface px-2">
      {requester ? (
        <>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className={cn(TAB, 'border-transparent text-fg-muted hover:text-fg')}
            onClick={() => (org ? openOrg(org.id, org.name) : goTo('/agent/orgs'))}
          >
            <Building2 aria-hidden="true" className="size-4" />
            {org ? org.name : 'Organização (criar)'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className={cn(TAB, 'border-transparent text-fg-muted hover:text-fg')}
            onClick={() => openUser(requester.id, requester.name)}
          >
            <User aria-hidden="true" className="size-4" />
            Cliente
          </button>
        </>
      ) : null}
      <button type="button" role="tab" aria-selected className={cn(TAB, 'border-ink-active font-semibold text-fg')}>
        {status ? <StatusBadge status={status} compact data-testid="subtab-status" /> : null}
        {label}
      </button>
    </div>
  );
}
