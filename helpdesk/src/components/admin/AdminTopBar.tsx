import { ChevronDown, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Input, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui';
import { IS_REAL } from '@/api/mode';
import { useSession } from '@/store/useSession';
import { ALL_NAV_ITEMS } from './nav';

export const ADMIN_ACCOUNT = 'Resolv';
export const ADMIN_USER = 'Henrique Souza';

/** Nome de quem administra: no modo real, o usuário da sessão; no mock, o administrador fixo de exemplo. */
export function useAdminName(): string {
  const sessionName = useSession((s) => (IS_REAL ? s.user?.name : undefined));
  return sessionName ?? ADMIN_USER;
}

function AdminSwitcher() {
  const navigate = useNavigate();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm font-semibold text-fg outline-none hover:bg-hover focus-visible:shadow-focus data-[state=open]:bg-surface-2"
        >
          Central de administração
          <ChevronDown aria-hidden className="h-4 w-4 text-fg-muted" />
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => navigate('/agent/home')}>Suporte</MenuItem>
        <MenuItem checked={true}>Central de administração</MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Busca simples sobre os itens do menu de administração. */
function AdminSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ALL_NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 6) : [];
  }, [query]);

  const go = (to: string) => {
    setQuery('');
    navigate(to);
  };

  return (
    <div className="relative w-72">
      <Input
        type="search"
        aria-label="Pesquisar central de administração"
        placeholder="Pesquisar central de administração"
        leadingIcon={<Search />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) go(results[0].to);
          if (e.key === 'Escape') setQuery('');
        }}
      />
      {query.trim() ? (
        <ul aria-label="Resultados da pesquisa" className="absolute left-0 right-0 top-9 z-40 rounded border border-line bg-surface py-1 shadow-menu">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">Nenhum resultado</li>
          ) : (
            results.map((r) => (
              <li key={r.to}>
                <button
                  type="button"
                  onClick={() => go(r.to)}
                  className="flex h-8 w-full items-center justify-between px-3 text-left text-sm text-fg outline-none hover:bg-hover focus-visible:shadow-focus"
                >
                  {r.label}
                  <span className="text-xs text-fg-muted">{r.section.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const adminName = useAdminName();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-pill outline-none focus-visible:shadow-focus">
          <span className="sr-only">{`${adminName}, administrador`}</span>
          <Avatar name={adminName} size={28} decorative />
        </button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={() => navigate('/agent/home')}>Voltar para Suporte</MenuItem>
      </MenuContent>
    </Menu>
  );
}

export interface AdminTopBarProps {
  copilotOpen: boolean;
  onCopilotToggle: () => void;
}

/** Barra superior da administração: seletor de produto, conta, busca, Copiloto e avatar. */
export function AdminTopBar({ copilotOpen, onCopilotToggle }: AdminTopBarProps) {
  return (
    <header className="relative z-30 flex h-topbar shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-3">
      <div className="flex shrink-0 items-center gap-1">
        <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-xs bg-ink-active text-2xs font-semibold text-fg-inverse">
          H
        </span>
        <AdminSwitcher />
      </div>
      <span className="truncate text-sm text-fg-muted">{ADMIN_ACCOUNT}</span>
      <div className="flex-1" />
      <AdminSearch />
      <Button
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={copilotOpen}
        onClick={onCopilotToggle}
        leadingIcon={<Sparkles className="text-ai" />}
      >
        Copiloto
      </Button>
      <UserMenu />
    </header>
  );
}
