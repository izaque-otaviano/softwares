import { Building2, Home, Inbox, PanelLeftClose, PanelLeftOpen, Users, type LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { Tooltip } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useUi } from '@/store/useUi';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/agent/home', label: 'Início', icon: Home },
  { to: '/agent/views', label: 'Visualizações', icon: Inbox },
  { to: '/agent/customers', label: 'Clientes', icon: Users },
  { to: '/agent/orgs', label: 'Organizações', icon: Building2 },
];

/** Trilho de navegação à esquerda. Recolhido (w-rail) mostra só ícones com tooltip; expandido mostra os rótulos. */
export function NavRail() {
  const compact = useMediaQuery('(max-width: 1099.98px)');
  // Abaixo de 1100 px o trilho fica só com ícones, qualquer que seja a preferência salva.
  const collapsed = useUi((s) => s.sidebarCollapsed) || compact;
  const setCollapsed = useUi((s) => s.setSidebarCollapsed);
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Navegação principal"
      className={cn('flex shrink-0 flex-col border-r border-line bg-surface-1 py-2', collapsed ? 'w-rail items-center' : 'w-48 items-stretch px-3')}
    >
      <ul className={cn('flex flex-1 flex-col gap-1', collapsed && 'items-center')}>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          const link = (
            <NavLink
              to={to}
              aria-label={collapsed ? label : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded text-sm outline-none focus-visible:shadow-focus',
                collapsed ? 'h-8 w-8 justify-center' : 'h-8 w-full',
              )}
            >
              <span
                data-active={active || undefined}
                className={cn(
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded transition-colors duration-100',
                  active ? 'bg-ink-active text-fg-inverse' : 'text-fg-muted group-hover:bg-hover group-hover:text-fg',
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
              </span>
              {collapsed ? null : <span className={cn('truncate', active ? 'font-semibold text-fg' : 'text-fg-muted')}>{label}</span>}
            </NavLink>
          );
          return (
            <li key={to}>
              {collapsed ? (
                <Tooltip content={label} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>
      {compact ? null : (
      <Tooltip content={collapsed ? 'Expandir menu' : 'Recolher menu'} side="right">
        <button
          type="button"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex h-8 items-center gap-3 rounded text-sm text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:shadow-focus',
            collapsed ? 'w-8 justify-center' : 'w-full',
          )}
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center">
            {collapsed ? <PanelLeftOpen aria-hidden className="h-4 w-4" /> : <PanelLeftClose aria-hidden className="h-4 w-4" />}
          </span>
          {collapsed ? null : <span className="truncate">Recolher</span>}
        </button>
      </Tooltip>
      )}
    </nav>
  );
}
