import { ExternalLink, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { orgsApi } from '@/api';
import { AddOrgModal } from '@/components/people/OrgModal';
import { openOrg } from '@/components/shell/openTab';
import { Button, Input, Pill, Table, type ColumnDef, type SortState } from '@/components/ui';
import { absoluteTime } from '@/lib/time';
import { toast } from '@/store/useUi';
import type { Org } from '@/types/domain';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function sortOrgs(list: Org[], sort: SortState | null): Org[] {
  if (!sort) return list;
  const dir = sort.direction === 'desc' ? -1 : 1;
  const key = (o: Org): string | number => {
    switch (sort.columnId) {
      case 'name': return norm(o.name);
      case 'domain': return o.domains[0] ?? '';
      case 'createdAt': return o.createdAt ? new Date(o.createdAt).getTime() : 0;
      default: return o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
    }
  };
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return (typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), 'pt-BR')) * dir;
  });
}

export default function Orgs() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>({ columnId: 'name', direction: 'asc' });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setOrgs([...(await orgsApi.listOrgs())]);
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
    return sortOrgs(
      orgs.filter((o) => !q || norm(o.name).includes(q) || o.domains.some((d) => norm(d).includes(q))),
      sort,
    );
  }, [orgs, query, sort]);

  const columns: ColumnDef<Org>[] = [
    {
      id: 'name',
      header: 'Nome',
      label: 'Nome',
      sortable: true,
      width: 260,
      cell: (o) => (
        <button type="button" className="min-w-0 truncate rounded text-left text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none" onClick={() => openOrg(o.id, o.name)}>
          {o.name}
        </button>
      ),
    },
    { id: 'domain', header: 'Domínio', label: 'Domínio', sortable: true, width: 240, cell: (o) => (o.domains.length ? o.domains.join(', ') : '-') },
    {
      id: 'tags',
      header: 'Tags',
      label: 'Tags',
      width: 200,
      cell: (o) =>
        o.tags.length ? (
          <span className="flex flex-wrap gap-1">
            {o.tags.slice(0, 3).map((t) => (
              <Pill key={t}>{t}</Pill>
            ))}
          </span>
        ) : (
          '-'
        ),
    },
    { id: 'createdAt', header: 'Data da criação', label: 'Data da criação', sortable: true, width: 180, cell: (o) => (o.createdAt ? absoluteTime(o.createdAt) : '-') },
    { id: 'updatedAt', header: 'Data da última atualização', label: 'Data da última atualização', sortable: true, width: 220, cell: (o) => (o.updatedAt ? absoluteTime(o.updatedAt) : '-') },
  ];

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-xl font-normal text-fg">Organizações</h1>
          <p className="mt-1 max-w-xl text-sm text-fg-muted">Agrupe clientes por empresa para acompanhar todos os tickets de uma organização.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" trailingIcon={<ExternalLink />} onClick={() => toast.info('Importação em massa fora desta versão')}>
            Importar em massa
          </Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            Adicionar organização
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 pb-3">
        <Input
          aria-label="Pesquisar organizações"
          placeholder="Pesquisar organizações"
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
          {loading ? 'Carregando organizações…' : `${rows.length} ${rows.length === 1 ? 'organização' : 'organizações'}`}
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <Table<Org>
          id="orgs"
          aria-label="Organizações"
          columns={columns}
          rows={loading || error ? [] : rows}
          getRowId={(o) => o.id}
          getRowLabel={(o) => o.name}
          loading={loading}
          error={error ? { message: 'Não foi possível carregar as organizações.', onRetry: () => void load() } : undefined}
          empty={{ illustration: 'search', title: query ? 'Nenhuma organização encontrada' : 'Nenhuma organização ainda', description: query ? 'Tente outro nome ou domínio.' : undefined }}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(o) => openOrg(o.id, o.name)}
          resizable
          stickyHeader
          className="h-full"
        />
      </div>
      <AddOrgModal open={adding} onOpenChange={setAdding} onCreated={() => void load()} />
    </div>
  );
}
