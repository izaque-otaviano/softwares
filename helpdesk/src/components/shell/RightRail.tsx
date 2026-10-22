import { useLocation } from 'react-router-dom';
import { BookOpen, CheckCircle2, LayoutGrid, MessagesSquare, Sparkles, Stamp, User, type LucideIcon } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { useMergeSuggestions, useActiveTicketKey, useRightPanel, type PanelId } from '@/components/ticket/panels/panelState';

const ITEMS: { id: PanelId; label: string; icon: LucideIcon }[] = [
  { id: 'customer', label: 'Cliente', icon: User },
  { id: 'knowledge', label: 'Conhecimento', icon: BookOpen },
  { id: 'side', label: 'Conversas paralelas', icon: MessagesSquare },
  { id: 'merge', label: 'Sugestões de fusão', icon: Sparkles },
  { id: 'approval', label: 'Solicitação de aprovação', icon: Stamp },
  { id: 'tasks', label: 'Tarefas', icon: CheckCircle2 },
  { id: 'apps', label: 'Aplicativos', icon: LayoutGrid },
];

/** Trilho direito (w-rail2): um painel aberto por vez; clicar de novo fecha. */
export function RightRail() {
  const open = useRightPanel((s) => s.open);
  const toggle = useRightPanel((s) => s.toggle);
  const mergeCount = useMergeSuggestions(useActiveTicketKey()).length;
  const { pathname } = useLocation();
  // Perfis de cliente e organização só têm a grade de aplicativos.
  const items = /^\/agent\/(customers|orgs)\//.test(pathname) ? ITEMS.filter((i) => i.id === 'apps') : ITEMS;
  return (
    <aside aria-label="Painéis laterais" className="flex w-rail2 shrink-0 flex-col items-center gap-1 border-l border-line bg-surface-1 py-2">
      {items.map(({ id, label, icon: Icon }) => {
        const badge = id === 'merge' && mergeCount > 0 ? mergeCount : 0;
        return (
          <div key={id} className="relative">
            <IconButton
              label={label}
              tooltipSide="left"
              pressed={open === id}
              icon={<Icon aria-hidden className="h-4 w-4" />}
              onClick={() => toggle(id)}
            />
            {badge ? (
              <span
                data-testid="merge-badge"
                aria-label={`${badge} sugestões`}
                className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-2xs font-semibold text-fg-inverse"
              >
                {badge}
              </span>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}

/** Rotas que mostram o trilho: ticket (inclui novo), cliente e organização. */
export function showsRightRail(pathname: string): boolean {
  return /^\/agent\/(tickets\/[^/]+|customers\/[^/]+|orgs\/[^/]+)\/?$/.test(pathname);
}
