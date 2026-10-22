import * as Popover from '@radix-ui/react-popover';
import { Bell, ChevronDown, LogOut, MessageSquare, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, IconButton, Menu, MenuContent, MenuItem, MenuTrigger, PRESENCE_LABEL, StatusDot, type Presence } from '@/components/ui';
import { cn } from '@/lib/cn';
import { IS_REAL } from '@/api/mode';
import { useSession } from '@/store/useSession';
import { toast } from '@/store/useUi';
import { GlobalSearch } from './GlobalSearch';
import { useAgentPresence } from './presence';
import { WorkTabs } from './WorkTabs';

const UNREAD_NOTIFICATIONS = 3;
const CONVERSATIONS_COUNT = 0;

function ProductSwitcher() {
  const navigate = useNavigate();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm font-semibold text-fg outline-none hover:bg-hover focus-visible:shadow-focus data-[state=open]:bg-surface-2"
        >
          Suporte
          <ChevronDown aria-hidden className="h-4 w-4 text-fg-muted" />
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem checked={true}>Suporte</MenuItem>
        <MenuItem onSelect={() => toast.info('Conhecimento não faz parte desta versão.')}>Conhecimento</MenuItem>
        <MenuItem onSelect={() => navigate('/admin')}>Administração</MenuItem>
      </MenuContent>
    </Menu>
  );
}

const PRESENCES: Presence[] = ['available', 'away', 'offline'];

function AgentMenu() {
  const presence = useAgentPresence((s) => s.presence);
  const setPresence = useAgentPresence((s) => s.setPresence);
  const user = useSession((s) => s.user);
  const agentName = user?.name ?? 'Agente';
  const roleLabel = user?.role === 'admin' ? 'Administrador' : 'Agente';
  const navigate = useNavigate();
  const signOut = async () => {
    await useSession.getState().logout();
    navigate('/login', { replace: true });
  };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-pill outline-none focus-visible:shadow-focus"
        >
          <span className="sr-only">{`${agentName}, ${PRESENCE_LABEL[presence]}`}</span>
          <Avatar name={agentName} size={28} presence={presence} decorative />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          aria-label="Conta do agente"
          className="anim-pop-in z-[80] w-60 rounded border border-line bg-surface p-3 text-sm text-fg shadow-menu outline-none"
        >
          <p className="font-semibold">{agentName}</p>
          <p className="mb-2 text-xs text-fg-muted">{roleLabel}</p>
          <div role="radiogroup" aria-label="Status do agente" className="flex flex-col gap-0.5">
            {PRESENCES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={presence === p}
                onClick={() => setPresence(p)}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-xs px-2 text-left outline-none hover:bg-hover focus-visible:shadow-focus',
                  presence === p && 'bg-action-soft font-semibold',
                )}
              >
                <StatusDot presence={p} />
                {PRESENCE_LABEL[p]}
              </button>
            ))}
          </div>
          {IS_REAL ? (
            <>
              <div role="separator" className="my-2 border-t border-line" />
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex h-8 w-full items-center gap-2 rounded-xs px-2 text-left outline-none hover:bg-hover focus-visible:shadow-focus"
              >
                <LogOut aria-hidden className="h-4 w-4 text-fg-muted" />
                Sair
              </button>
            </>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Barra superior: logo, produto, abas de trabalho, busca, conversas, telefone, sino e agente. */
export function TopBar() {
  return (
    <header className="relative z-30 flex h-topbar shrink-0 items-center gap-2 border-b border-line bg-surface-1 px-3">
      <div className="flex shrink-0 items-center gap-1">
        <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-xs bg-ink-active text-2xs font-semibold text-fg-inverse">
          H
        </span>
        <ProductSwitcher />
      </div>
      <WorkTabs />
      <div className="flex shrink-0 items-center gap-1">
        <GlobalSearch />
        <button
          type="button"
          disabled
          className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded border border-line bg-surface-2 px-2 text-sm text-fg-subtle"
        >
          <MessageSquare aria-hidden className="h-4 w-4" />
          Conversas{' '}
          <span className="rounded-pill bg-surface px-1.5 text-xs">{CONVERSATIONS_COUNT}</span>
        </button>
        <IconButton label="Telefone" icon={<Phone />} onClick={() => toast.info('Telefonia não faz parte desta versão.')} />
        <span className="relative inline-flex">
          <IconButton label={`Notificações, ${UNREAD_NOTIFICATIONS} não lidas`} icon={<Bell />} />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-2xs font-semibold text-fg-inverse"
          >
            {UNREAD_NOTIFICATIONS}
          </span>
        </span>
        <AgentMenu />
      </div>
    </header>
  );
}
