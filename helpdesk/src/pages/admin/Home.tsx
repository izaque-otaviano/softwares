import { useMemo } from 'react';
import { localHint } from '@/api/capabilities';
import { fieldsApi, macrosApi, membersApi, triggersApi } from '@/api';
import { AdminBody, ProgressBar } from '@/components/admin/AdminPage';
import { useAdminName } from '@/components/admin/AdminTopBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/useAsync';
import { Banner, EmptyState, Skeleton, Table, type ColumnDef } from '@/components/ui';
import type { Macro, TicketField, Trigger } from '@/types/domain';

const LIMITS = { fields: 20, triggers: 10 };

interface HomeData {
  licenses: membersApi.Licenses;
  fields: TicketField[];
  macros: Macro[];
  triggers: Trigger[];
}

export interface ResourceRow {
  id: string;
  name: string;
  active: number;
  /** null = backend não informa uso (ex.: macros no Resolv). */
  runs24h: number | null;
  unused30d: number | null;
}

/**
 * Uso de macros/gatilhos. Quando nenhum item tem contador de uso (>0), devolve null
 * nas colunas de execução (típico do modo real: o backend não expõe usage7d/fired7d).
 */
export function resourceRows(macros: Macro[], triggers: Trigger[]): ResourceRow[] {
  const activeM = macros.filter((m) => m.active);
  const activeT = triggers.filter((t) => t.active);
  const macrosTracked = macros.some((m) => m.usage7d > 0);
  const triggersTracked = triggers.some((t) => t.fired7d > 0);
  return [
    {
      id: 'macros',
      name: 'Macros',
      active: activeM.length,
      runs24h: macrosTracked ? Math.round(activeM.reduce((n, m) => n + m.usage7d, 0) / 7) : null,
      unused30d: macrosTracked ? activeM.filter((m) => m.usage7d === 0).length : null,
    },
    {
      id: 'triggers',
      name: 'Gatilhos',
      active: activeT.length,
      runs24h: triggersTracked ? Math.round(activeT.reduce((n, t) => n + t.fired7d, 0) / 7) : null,
      unused30d: triggersTracked ? activeT.filter((t) => t.fired7d === 0).length : null,
    },
  ];
}

const dash = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR'));

const COLUMNS: ColumnDef<ResourceRow>[] = [
  { id: 'name', header: 'Recurso', label: 'Recurso', cell: (r) => <span className="font-semibold">{r.name}</span>, width: 220 },
  { id: 'active', header: 'Ativos', label: 'Ativos', cell: (r) => r.active, width: 140 },
  { id: 'runs', header: 'Execuções (24 h)', label: 'Execuções (24 h)', cell: (r) => dash(r.runs24h), width: 180 },
  { id: 'unused', header: 'Sem uso (30 d)', label: 'Sem uso (30 d)', cell: (r) => dash(r.unused30d), width: 180 },
];

export default function AdminHome() {
  const adminName = useAdminName();
  const { data, loading, error, reload } = useAsync<HomeData>(async () => {
    const [licenses, fields, macros, triggers] = await Promise.all([
      membersApi.getLicenses(),
      fieldsApi.listFields(),
      macrosApi.listMacros(),
      triggersApi.listTriggers(),
    ]);
    return { licenses, fields, macros, triggers };
  });

  const rows = useMemo(() => (data ? resourceRows(data.macros, data.triggers) : []), [data]);
  const usage = data
    ? [
        {
          id: 'agents',
          label: 'Agentes',
          value: data.licenses.used,
          max: Math.max(data.licenses.total, data.licenses.used),
          hint: localHint('licenses', 'Agentes ativos no diretório; o teto é local (o backend não expõe cotas de licença).'),
        },
        {
          id: 'fields',
          label: 'Campos personalizados',
          value: data.fields.filter((f) => !f.system && f.active).length,
          max: Math.max(LIMITS.fields, data.fields.filter((f) => !f.system && f.active).length),
          hint: 'Limite operacional sugerido da conta.',
        },
        {
          id: 'triggers',
          label: 'Gatilhos ativos',
          value: data.triggers.filter((t) => t.active).length,
          max: Math.max(LIMITS.triggers, data.triggers.filter((t) => t.active).length),
          hint: 'Limite operacional sugerido da conta.',
        },
      ]
    : [];

  return (
    <>
      <PageHeader title={`Olá, ${adminName.split(' ')[0]}`} description="Veja o uso da sua conta e o que merece atenção." />
      <AdminBody className="flex flex-col gap-8">
        <section aria-labelledby="home-reco">
          <h2 id="home-reco" className="mb-2 text-md font-semibold">
            Recomendações
          </h2>
          <div className="rounded border border-line">
            <EmptyState compact illustration="search" title="Nenhuma recomendação à vista" description="Quando houver algo a melhorar na sua conta, ele aparece aqui." />
          </div>
        </section>

        <section aria-labelledby="home-uso">
          <h2 id="home-uso" className="mb-2 text-md font-semibold">
            Uso
          </h2>
          {error && !data ? (
            <Banner tone="error" onRetry={reload}>
              {error}
            </Banner>
          ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {loading && !data
              ? [0, 1, 2].map((i) => (
                  <li key={i} className="rounded border border-line p-4">
                    <Skeleton width="50%" />
                    <Skeleton className="mt-3" height={8} />
                  </li>
                ))
              : usage.map((u) => (
                  <li key={u.id} className="rounded border border-line p-4">
                    <p className="text-xs font-semibold text-fg-muted">{u.label}</p>
                    <p className="mb-3 mt-1 text-xl">
                      {u.value} de {u.max}
                    </p>
                    <ProgressBar value={u.value} max={u.max} label={`${u.label}: ${u.value} de ${u.max}`} />
                    {u.hint ? <p className="mt-2 text-xs text-fg-muted">{u.hint}</p> : null}
                  </li>
                ))}
          </ul>
          )}
        </section>

        <section aria-labelledby="home-recursos">
          <h2 id="home-recursos" className="mb-2 text-md font-semibold">
            Uso de recursos
          </h2>
          <p className="mb-2 text-sm text-fg-muted">
            Execuções e “sem uso” usam contadores de 7 dias quando existem; se o backend não os envia, a coluna mostra —.
          </p>
          <Table
            id="admin-home-resources"
            aria-label="Uso de recursos"
            columns={COLUMNS}
            rows={rows}
            getRowId={(r) => r.id}
            loading={loading && !data}
            error={error && !data ? { message: error, onRetry: reload } : undefined}
            empty={{ title: 'Nenhum recurso encontrado' }}
          />
        </section>
      </AdminBody>
    </>
  );
}
