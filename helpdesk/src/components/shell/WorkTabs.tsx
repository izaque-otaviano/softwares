import { Building2, Mail, Phone, Plus, Search, SquarePen, User, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmModal, IconButton, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, StatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useTabs, type WorkTab } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { activateTab, goTo, openNewTicket, openTicket, tabPath } from './openTab';
import { useSearchUi } from './searchState';

function tabIcon(tab: WorkTab): LucideIcon {
  switch (tab.kind) {
    case 'ticket':
      return tab.channel === 'web_form' ? Phone : Mail;
    case 'new-ticket':
      return SquarePen;
    case 'user':
      return User;
    case 'org':
      return Building2;
    case 'search':
      return Search;
  }
}

const KIND_LABEL: Record<WorkTab['kind'], string> = {
  ticket: 'Ticket',
  'new-ticket': 'Novo ticket',
  user: 'Usuário',
  org: 'Organização',
  search: 'Pesquisa',
};

/** Segunda linha da aba: `#id` para tickets; subtítulo (ou o tipo) para os demais. */
function secondLine(tab: WorkTab): string {
  if (tab.kind === 'ticket') return `#${tab.refId}`;
  return tab.subtitle ?? KIND_LABEL[tab.kind];
}

/** Abas de trabalho da TopBar (brief 5.1). */
export function WorkTabs() {
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const recent = useTabs((s) => s.recent);
  const statuses = useTickets((s) => s.statuses);
  const tickets = useTickets((s) => s.tickets);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const afterClose = (wasActive: boolean) => {
    if (!wasActive) return;
    const { tabs: rest, activeTabId: next } = useTabs.getState();
    const target = rest.find((t) => t.id === next);
    goTo(target ? tabPath(target) : '/agent/home');
  };

  const close = (id: string) => {
    const wasActive = useTabs.getState().activeTabId === id;
    const { needsConfirm } = useTabs.getState().requestClose(id);
    if (needsConfirm) setConfirmId(id);
    else afterClose(wasActive);
  };

  const confirmTab = tabs.find((t) => t.id === confirmId);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div role="tablist" aria-label="Abas de trabalho" className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const Icon = tabIcon(tab);
          return (
            <div
              key={tab.id}
              role="presentation"
              className={cn(
                'group flex h-10 w-48 shrink-0 items-center rounded transition-colors duration-100',
                active ? 'bg-ink-active text-fg-inverse' : 'text-fg hover:bg-hover',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={tab.title}
                onClick={() => activateTab(tab.id)}
                onAuxClick={(e) => {
                  if (e.button === 1) close(tab.id);
                }}
                className="flex h-full min-w-0 flex-1 items-center gap-2 rounded pl-2 text-left outline-none focus-visible:shadow-focus"
              >
                <Icon aria-hidden className={cn('h-4 w-4 shrink-0', active ? 'text-fg-inverse' : 'text-fg-muted')} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{tab.title}</span>
                  <span className={cn('truncate text-xs', active ? 'text-fg-inverse/70' : 'text-fg-muted')}>{secondLine(tab)}</span>
                </span>
              </button>
              {tab.dirty ? (
                <span role="img" aria-label="Alterações não salvas" title="Alterações não salvas" className="px-1 text-sm leading-none">
                  •
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`Fechar aba ${tab.title}`}
                onClick={() => close(tab.id)}
                className={cn(
                  'mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded outline-none focus-visible:shadow-focus',
                  active ? 'hover:bg-fg-inverse/20' : 'hover:bg-hover',
                )}
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <Menu>
        <IconButtonTrigger />
        <MenuContent align="start" className="w-72">
          <MenuLabel>Novo</MenuLabel>
          <MenuItem icon={<SquarePen />} onSelect={() => openNewTicket()}>
            Ticket
          </MenuItem>
          <MenuItem icon={<User />} onSelect={() => goTo('/agent/customers')}>
            Usuário
          </MenuItem>
          <MenuItem icon={<Building2 />} onSelect={() => goTo('/agent/orgs')}>
            Organização
          </MenuItem>
          <MenuItem icon={<Search />} onSelect={() => useSearchUi.getState().setOpen(true)}>
            Pesquisar
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>Tickets visualizados recentemente</MenuLabel>
          {recent.length === 0 ? <p className="px-2 py-1.5 text-xs text-fg-muted">Nenhum ticket visualizado ainda.</p> : null}
          {recent.slice(0, 6).map((r) => {
            const status = statuses.find((s) => s.id === tickets.find((t) => t.id === r.ticketId)?.statusId);
            return (
              <MenuItem
                key={r.ticketId}
                textValue={`${r.title} #${r.ticketId}`}
                onSelect={() => openTicket(r.ticketId, { title: r.title, requesterName: r.requesterName })}
              >
                <span className="flex items-center gap-2">
                  {status ? <StatusBadge status={status} compact /> : null}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{r.title}</span>
                    <span className="truncate text-xs text-fg-muted">
                      #{r.ticketId}
                      {r.requesterName ? ` - ${r.requesterName}` : ''}
                    </span>
                  </span>
                </span>
              </MenuItem>
            );
          })}
        </MenuContent>
      </Menu>

      <ConfirmModal
        open={confirmTab !== undefined}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
        title="Descartar alterações?"
        description={`A aba "${confirmTab?.title ?? ''}" tem alterações não salvas. Se você fechá-la, elas serão perdidas.`}
        confirmLabel="Descartar"
        cancelLabel="Cancelar"
        onConfirm={() => {
          if (!confirmId) return;
          const wasActive = useTabs.getState().activeTabId === confirmId;
          useTabs.getState().closeTab(confirmId);
          setConfirmId(null);
          afterClose(wasActive);
        }}
      />
    </div>
  );
}

function IconButtonTrigger() {
  return (
    <MenuTrigger asChild>
      <IconButton label="Nova aba" icon={<Plus />} />
    </MenuTrigger>
  );
}
