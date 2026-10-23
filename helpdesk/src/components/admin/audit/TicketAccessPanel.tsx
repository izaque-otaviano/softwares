import { useMemo, useState } from 'react';
import { getTicketAccess, listTicketAccess } from '@/api/audit';
import { useAsync } from '@/components/admin/useAsync';
import { Banner, Drawer, Field, Input, Pill, Table, type ColumnDef } from '@/components/ui';
import type { TicketAccessEntry } from '@/types/admin-b';
import { contextLabel } from './actions';
import { DetailList } from './DetailList';
import { dateTime } from './format';
import { Pager } from './Pager';
import { usePaged } from './usePaged';
import { UserPicker } from './UserPicker';

const PAGE = 25;

/** Quem leu tickets de equipes restritas, inclusive as tentativas negadas. */
export function TicketAccessPanel() {
  const [user, setUser] = useState<string | null>(null);
  const [ticket, setTicket] = useState('');
  const [deniedOnly, setDeniedOnly] = useState(false);
  const [open, setOpen] = useState<TicketAccessEntry | null>(null);
  const ticketId = /^\d+$/.test(ticket.trim()) ? ticket.trim() : '';
  const key = JSON.stringify({ user, ticketId, deniedOnly });
  const { page, loading, error, offset, setOffset, reload } = usePaged(
    (o) => listTicketAccess({ limit: PAGE, offset: o, user: user ?? undefined, ticket: ticketId || undefined, deniedOnly }),
    key,
  );

  const columns: ColumnDef<TicketAccessEntry>[] = useMemo(
    () => [
      { id: 'createdAt', header: 'Quando', label: 'Quando', width: 150, cell: (a) => dateTime(a.createdAt) },
      { id: 'user', header: 'Quem', label: 'Quem', width: 180, cell: (a) => a.userName },
      { id: 'ticket', header: 'Ticket', label: 'Ticket', width: 120, cell: (a) => a.ticketReference },
      { id: 'team', header: 'Equipe', label: 'Equipe', width: 150, cell: (a) => a.team || '—' },
      { id: 'context', header: 'Por onde', label: 'Por onde', width: 140, cell: (a) => contextLabel(a.context) },
      { id: 'result', header: 'Resultado', label: 'Resultado', width: 120, cell: (a) => (a.granted ? 'Permitido' : <Pill tone="danger">Negado</Pill>) },
      { id: 'ip', header: 'Endereço IP', label: 'Endereço IP', width: 140, defaultHidden: true, cell: (a) => a.ip ?? '—' },
    ],
    [],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Quem acessou">
          <UserPicker value={user} onChange={setUser} aria-label="Filtrar por usuário que acessou" className="w-56" />
        </Field>
        <Field label="Ticket (número interno)" error={ticket.trim() && !ticketId ? 'Digite só números.' : undefined}>
          <Input inputMode="numeric" value={ticket} onChange={(e) => setTicket(e.target.value)} className="w-40" placeholder="Ex.: 8" />
        </Field>
        <label className="flex min-h-8 items-center gap-2 pb-0.5 text-sm text-fg">
          <input type="checkbox" checked={deniedOnly} onChange={(e) => setDeniedOnly(e.target.checked)} className="h-4 w-4" />
          Somente acessos negados
        </label>
      </div>
      <Table<TicketAccessEntry>
        id="admin-ticket-access"
        aria-label="Acessos a tickets"
        columns={columns}
        rows={page?.items ?? []}
        getRowId={(a) => a.id}
        getRowLabel={(a) => `${a.userName} em ${a.ticketReference}`}
        loading={loading && !page}
        error={error && !page ? { message: error, onRetry: reload } : undefined}
        onRowClick={setOpen}
        empty={{ title: 'Nenhum acesso encontrado', description: 'Ajuste os filtros.' }}
      />
      {error && page ? (
        <div className="pt-3">
          <Banner tone="error" onRetry={reload}>
            {error}
          </Banner>
        </div>
      ) : null}
      {page ? <Pager total={page.total} limit={page.limit} offset={offset} onOffset={setOffset} loading={loading} label="Paginação dos acessos" /> : null}
      <AccessDrawer entry={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function AccessDrawer({ entry, onClose }: { entry: TicketAccessEntry | null; onClose: () => void }) {
  return (
    <Drawer open={entry !== null} onOpenChange={(o) => !o && onClose()} title="Detalhe do acesso" description={entry ? `Acesso #${entry.id}` : undefined}>
      {entry ? <AccessBody key={entry.id} entry={entry} /> : null}
    </Drawer>
  );
}

function AccessBody({ entry }: { entry: TicketAccessEntry }) {
  const detail = useAsync(() => getTicketAccess(entry.id));
  const current = detail.data ?? entry;
  return (
    <div className="space-y-3">
      <DetailList
        items={[
          { label: 'Quando', value: dateTime(current.createdAt) },
          { label: 'Quem', value: current.userName },
          { label: 'Ticket', value: current.ticketReference },
          { label: 'Equipe', value: current.team },
          { label: 'Por onde', value: contextLabel(current.context) },
          { label: 'Resultado', value: current.granted ? 'Permitido' : 'Negado' },
          { label: 'Endereço IP', value: current.ip },
        ]}
      />
      {detail.error ? <p className="text-sm text-danger">{detail.error}</p> : null}
    </div>
  );
}
