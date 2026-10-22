import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input, Select } from '@/components/ui';

export type ActiveFilter = 'active' | 'inactive' | 'all';

export const ACTIVE_FILTER_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'all', label: 'Todos' },
];

export function matchesActive(active: boolean, filter: ActiveFilter): boolean {
  return filter === 'all' || (filter === 'active' ? active : !active);
}

export interface ListToolbarProps {
  searchLabel: string;
  query: string;
  onQuery: (q: string) => void;
  filterLabel: string;
  filter: ActiveFilter;
  onFilter: (f: ActiveFilter) => void;
  /** Controles à direita da busca/filtro (Ações ▾, CTA...). */
  children?: ReactNode;
}

/** Busca + filtro de ativo/inativo + controles à direita, comum às listas do admin. */
export function ListToolbar({ searchLabel, query, onQuery, filterLabel, filter, onFilter, children }: ListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3">
      <Input
        type="search"
        aria-label={searchLabel}
        placeholder="Pesquisar"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        leadingIcon={<Search />}
        className="w-64"
      />
      <Select aria-label={filterLabel} value={filter} onValueChange={(v) => onFilter(v as ActiveFilter)} options={ACTIVE_FILTER_OPTIONS} className="w-40" />
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
