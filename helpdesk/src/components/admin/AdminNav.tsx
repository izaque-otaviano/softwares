import { NavLink, useLocation } from 'react-router-dom';
import { SecondaryPanel } from '@/components/shell/SecondaryPanel';
import { Tooltip } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ADMIN_SECTIONS, isItemActive, sectionForPath } from './nav';

export const ADMIN_PANEL_KEY = 'admin';

/** Rail de 56 px com os ícones das seções. */
export function AdminRail() {
  const { pathname } = useLocation();
  const current = sectionForPath(pathname);
  return (
    <nav aria-label="Seções da administração" className="flex w-rail shrink-0 flex-col items-center border-r border-line bg-surface-1 py-2">
      <ul className="flex flex-col items-center gap-1">
        {ADMIN_SECTIONS.map(({ id, label, icon: Icon, to }) => {
          const active = id === current.id;
          return (
            <li key={id}>
              <Tooltip content={label} side="right">
                <NavLink
                  to={to}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded outline-none transition-colors duration-100 focus-visible:shadow-focus',
                    active ? 'bg-ink-active text-fg-inverse' : 'text-fg-muted hover:bg-hover hover:text-fg',
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4" />
                </NavLink>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Painel secundário em 2 níveis: título da seção, cabeçalhos de grupo e itens. Início não tem painel. */
export function AdminSecondaryNav() {
  const { pathname } = useLocation();
  const section = sectionForPath(pathname);
  if (section.groups.length === 0) return null;
  return (
    <SecondaryPanel pageKey={ADMIN_PANEL_KEY} width={240} title={section.label}>
      <nav aria-label={section.label} className="pb-4">
        {section.groups.map((group) => (
          <div key={group.label} className="mt-3 px-4 first:mt-1">
            <h3 className="mb-1 border-b border-line pb-1 text-2xs font-semibold uppercase tracking-wide text-fg-muted">{group.label}</h3>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isItemActive(pathname, item);
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-8 items-center rounded px-2 text-sm outline-none transition-colors duration-100 focus-visible:shadow-focus',
                        active ? 'bg-ink-active font-semibold text-fg-inverse' : 'text-fg hover:bg-hover',
                      )}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </SecondaryPanel>
  );
}
