import { useEffect, useMemo, useState } from 'react';
import { listGroups } from '@/api/meta';
import { listOrgs } from '@/api/orgs';
import { listUsers } from '@/api/users';
import { Button, Combobox, Field, Input, Select, type ComboOption, type SelectOption } from '@/components/ui';
import { useReports, type ReportTab } from '@/store/reports';
import { brDate, PERIOD_LABEL, rangeError, type PeriodPreset } from './periods';

const PRESETS: Exclude<PeriodPreset, 'custom'>[] = ['today', '7d', '30d'];

interface Options {
  teams: SelectOption[];
  agents: ComboOption[];
  companies: ComboOption[];
  failed: boolean;
}

function useOptions(): Options {
  const [opts, setOpts] = useState<Options>({ teams: [], agents: [], companies: [], failed: false });
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([listGroups(), listUsers({ role: 'agent' }), listUsers({ role: 'admin' }), listOrgs()]).then(([g, a, ad, o]) => {
      if (!alive) return;
      const agents = [...(a.status === 'fulfilled' ? a.value : []), ...(ad.status === 'fulfilled' ? ad.value : [])];
      setOpts({
        teams: g.status === 'fulfilled' ? g.value.map((t) => ({ value: t.id, label: t.name })) : [],
        agents: agents.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')).map((u) => ({ value: u.id, label: u.name })),
        companies: o.status === 'fulfilled' ? o.value.map((c) => ({ value: c.id, label: c.name })).sort((x, y) => x.label.localeCompare(y.label, 'pt-BR')) : [],
        failed: [g, a, ad, o].some((r) => r.status === 'rejected'),
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return opts;
}

/** Filtros: período (atalhos e personalizado) e, conforme a aba, equipe, responsável e empresa (só o que o backend aceita). */
export function FilterBar({ tab }: { tab: ReportTab }) {
  const { preset, from, to, teamId, agentId, companyId, setPreset, setCustomRange, setFilter, clearFilters } = useReports();
  const opts = useOptions();
  const [draft, setDraft] = useState({ from, to });
  useEffect(() => setDraft({ from, to }), [from, to]);
  const draftError = preset === 'custom' || draft.from !== from || draft.to !== to ? rangeError(draft.from, draft.to) : undefined;
  const teamOptions = useMemo<SelectOption[]>(() => [{ value: '', label: 'Todas as equipes' }, ...opts.teams], [opts.teams]);
  const active = (tab === 'tickets' && (teamId || companyId)) || agentId;

  const commit = (next: { from: string; to: string }) => {
    setDraft(next);
    if (!rangeError(next.from, next.to)) setCustomRange(next.from, next.to);
  };

  return (
    <form role="search" aria-label="Filtros do relatório" onSubmit={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border border-line bg-surface-1 p-3">
      <div role="group" aria-label="Período" className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          {([...PRESETS, 'custom'] as PeriodPreset[]).map((p) => (
            <Button
              key={p}
              variant={preset === p ? 'primary' : 'outline'}
              aria-pressed={preset === p}
              onClick={() => (p === 'custom' ? setCustomRange(draft.from, draft.to) : setPreset(p))}
            >
              {PERIOD_LABEL[p]}
            </Button>
          ))}
        </div>
        {preset === 'custom' ? (
          <>
            <Field label="De" error={draftError && draft.from > draft.to ? draftError : undefined}>
              <Input type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => commit({ from: e.target.value, to: draft.to })} className="w-40" />
            </Field>
            <Field label="Até" error={draftError && draft.from <= draft.to ? draftError : undefined}>
              <Input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => commit({ from: draft.from, to: e.target.value })} className="w-40" />
            </Field>
          </>
        ) : (
          <p className="pb-1.5 text-xs text-fg-muted">
            {brDate(from)}
            {from === to ? '' : ` a ${brDate(to)}`}
          </p>
        )}
      </div>
      {tab === 'tickets' ? (
        <Field label="Equipe">
          <Select aria-label="Equipe" value={teamId} onValueChange={(v) => setFilter('teamId', v)} options={teamOptions} className="w-44" />
        </Field>
      ) : null}
      <Field label="Responsável">
        <Combobox aria-label="Responsável" value={agentId || null} onValueChange={(v) => setFilter('agentId', v ?? '')} options={opts.agents} placeholder="Todos" searchPlaceholder="Buscar pessoa" emptyText="Ninguém encontrado" clearable className="w-44" />
      </Field>
      {tab === 'tickets' ? (
        <Field label="Empresa">
          <Combobox aria-label="Empresa" value={companyId || null} onValueChange={(v) => setFilter('companyId', v ?? '')} options={opts.companies} placeholder="Todas" searchPlaceholder="Buscar empresa" emptyText="Nenhuma empresa encontrada" clearable className="w-44" />
        </Field>
      ) : null}
      {active ? (
        <Button variant="ghost" onClick={clearFilters}>
          Limpar filtros
        </Button>
      ) : null}
      <p className="basis-full text-xs text-fg-muted">
        {tab === 'tickets' ? 'Prioridade e canal não são filtros do backend: aparecem como distribuição nos gráficos.' : 'O chat aceita período e responsável.'}
        {opts.failed ? ' Algumas listas de filtro não carregaram; tente atualizar a página.' : ''}
      </p>
    </form>
  );
}
