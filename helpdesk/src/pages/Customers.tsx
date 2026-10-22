import { AlertTriangle, ExternalLink, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usersApi } from '@/api';
import { AddCustomerModal } from '@/components/people/CustomerModal';
import { CustomersPanel, type CustomerList } from '@/components/people/CustomersPanel';
import { timezoneLabel } from '@/components/people/peopleUtils';
import { openUser } from '@/components/shell/openTab';
import { Avatar, Button, Input, Pill, Table, type ColumnDef, type SortState } from '@/components/ui';
import { relativeTime } from '@/lib/time';
import { toast } from '@/store/useUi';
import type { User } from '@/types/domain';

/** A dica "Todos os seus clientes em um só lugar" fica dispensada só em memória (volta ao recarregar). */
let tipDismissed = false;
export function resetCustomersTip(): void {
  tipDismissed = false;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function missingData(u: User): string[] {
  const out: string[] = [];
  if (!u.name.trim()) out.push('nome');
  if (!u.email.trim()) out.push('e-mail');
  if (!u.orgId) out.push('organização');
  return out;
}

function sortUsers(list: User[], sort: SortState | null): User[] {
  if (!sort) return list;
  const dir = sort.direction === 'desc' ? -1 : 1;
  const key = (u: User): string | number => {
    switch (sort.columnId) {
      case 'name': return norm(u.name);
      case 'email': return u.email.toLowerCase();
      case 'timezone': return u.timezone;
      default: return new Date(u.updatedAt).getTime();
    }
  };
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return (typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), 'pt-BR')) * dir;
  });
}

export default function Customers() {
  const [params] = useSearchParams();
  const list: CustomerList = params.get('lista') === 'suspensos' ? 'suspended' : 'all';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>({ columnId: 'updatedAt', direction: 'desc' });
  const [adding, setAdding] = useState(false);
  const [tip, setTip] = useState(!tipDismissed);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setUsers(await usersApi.listUsers({ role: 'end_user' }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = norm(query.trim());
    const filtered = users.filter(
      (u) => (list === 'all' || u.suspended) && (!q || norm(u.name).includes(q) || norm(u.email).includes(q)),
    );
    return sortUsers(filtered, sort);
  }, [users, list, query, sort]);

  const now = new Date();
  const columns: ColumnDef<User>[] = [
    { id: 'avatar', header: <span className="sr-only">Avatar</span>, label: 'Avatar', width: 56, cell: (u) => <Avatar name={u.name} size={28} decorative /> },
    {
      id: 'name',
      header: 'Nome',
      label: 'Nome',
      sortable: true,
      width: 240,
      cell: (u) => {
        const missing = missingData(u);
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <button type="button" className="min-w-0 truncate rounded text-left text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none" onClick={() => openUser(u.id, u.name)}>
              {u.name}
            </button>
            {missing.length ? (
              <span role="img" aria-label={`Dados incompletos: falta ${missing.join(', ')}`} title={`Dados incompletos: falta ${missing.join(', ')}`} className="shrink-0 text-note-badgeText">
                <AlertTriangle aria-hidden className="h-4 w-4" />
              </span>
            ) : null}
            {u.suspended ? <Pill tone="danger">Suspenso</Pill> : null}
          </span>
        );
      },
    },
    { id: 'email', header: 'E-mail', label: 'E-mail', sortable: true, width: 260, cell: (u) => u.email || '-' },
    {
      id: 'tags',
      header: 'Tags',
      label: 'Tags',
      width: 200,
      cell: (u) =>
        u.tags.length ? (
          <span className="flex flex-wrap gap-1">
            {u.tags.slice(0, 3).map((t) => (
              <Pill key={t}>{t}</Pill>
            ))}
          </span>
        ) : (
          '-'
        ),
    },
    { id: 'timezone', header: 'Fuso horário', label: 'Fuso horário', sortable: true, width: 200, cell: (u) => timezoneLabel(u.timezone) },
    { id: 'updatedAt', header: 'Data da última atualização', label: 'Data da última atualização', sortable: true, width: 200, cell: (u) => relativeTime(u.updatedAt, now) },
  ];

  const total = rows.length;
  return (
    <div className="flex h-full min-h-0 w-full">
      <CustomersPanel active={list} />
      <section aria-label="Clientes" className="flex min-w-0 flex-1 flex-col bg-surface">
        <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <h1 className="text-xl font-normal text-fg">{list === 'all' ? 'Clientes' : 'Usuários suspensos'}</h1>
            <p className="mt-1 max-w-xl text-sm text-fg-muted">
              Veja e gerencie as pessoas que entram em contato com a sua equipe. Saiba mais{' '}
              <a href="#saiba-mais" onClick={(e) => e.preventDefault()} className="inline-flex items-center gap-0.5 text-action hover:text-action-hover hover:underline">
                sobre clientes <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" trailingIcon={<ExternalLink />} onClick={() => toast.info('Importação em massa fora desta versão')}>
              Importar em massa
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              Adicionar cliente
            </Button>
          </div>
        </header>

        {tip ? (
          <section aria-label="Dica" className="mx-6 mb-3 flex items-center justify-between gap-4 rounded border border-line bg-surface-1 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-fg">Todos os seus clientes em um só lugar</h2>
              <p className="text-sm text-fg-muted">Pesquise, organize com tags e abra o perfil para ver o histórico de tickets de cada pessoa.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                tipDismissed = true;
                setTip(false);
              }}
            >
              Concluído
            </Button>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 pb-3">
          <Input
            aria-label="Pesquisar clientes"
            placeholder="Pesquisar clientes"
            className="w-72"
            leadingIcon={<Search />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            trailingSlot={
              query ? (
                <button type="button" aria-label="Limpar pesquisa" className="rounded text-fg-muted hover:text-fg focus-visible:shadow-focus focus-visible:outline-none" onClick={() => setQuery('')}>
                  <X aria-hidden className="h-4 w-4" />
                </button>
              ) : undefined
            }
          />
          <p className="text-sm text-fg-muted" aria-live="polite">
            {loading ? 'Carregando clientes…' : `${total} ${total === 1 ? 'cliente' : 'clientes'}`}
          </p>
        </div>

        <div className="min-h-0 flex-1">
          <Table<User>
            id="customers"
            aria-label="Clientes"
            columns={columns}
            rows={loading || error ? [] : rows}
            getRowId={(u) => u.id}
            getRowLabel={(u) => u.name}
            loading={loading}
            error={error ? { message: 'Não foi possível carregar os clientes.', onRetry: () => void load() } : undefined}
            empty={{ illustration: 'search', title: query ? 'Nenhum cliente encontrado' : list === 'suspended' ? 'Nenhum usuário suspenso' : 'Nenhum cliente ainda', description: query ? 'Tente outro nome ou e-mail.' : undefined }}
            sort={sort}
            onSortChange={setSort}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            onRowClick={(u) => openUser(u.id, u.name)}
            resizable
            stickyHeader
            className="h-full"
          />
        </div>
      </section>
      <AddCustomerModal open={adding} onOpenChange={setAdding} onCreated={() => void load()} />
    </div>
  );
}
