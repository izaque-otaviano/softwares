import { NavLink } from 'react-router-dom';
import { SecondaryPanel } from '@/components/shell/SecondaryPanel';
import { cn } from '@/lib/cn';

export type CustomerList = 'all' | 'suspended';

export const CUSTOMER_LISTS: { id: CustomerList; label: string }[] = [
  { id: 'all', label: 'Todos os clientes' },
  { id: 'suspended', label: 'Usuários suspensos' },
];

/** Painel secundário "Listas de clientes". A lista ativa vai na URL (?lista=suspensos). */
export function CustomersPanel({ active }: { active: CustomerList }) {
  return (
    <SecondaryPanel pageKey="customers" width={360} title="Listas de clientes">
      <nav aria-label="Listas de clientes" className="flex flex-col gap-0.5 px-2 pb-2">
        {CUSTOMER_LISTS.map((l) => (
          <NavLink
            key={l.id}
            to={l.id === 'all' ? '/agent/customers' : '/agent/customers?lista=suspensos'}
            aria-current={active === l.id ? 'page' : undefined}
            className={cn(
              'flex min-h-8 items-center rounded px-2 py-1 text-sm transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus focus-visible:outline-none',
              active === l.id ? 'bg-ink-active text-fg-inverse hover:bg-ink-active' : 'text-fg',
            )}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </SecondaryPanel>
  );
}
