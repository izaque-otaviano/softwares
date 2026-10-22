import { useMemo } from 'react';
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
  runs24h: number;
  unused30d: number;
}

/** Execuções em 24 h estimadas a partir do uso em 7 dias; "sem uso" = ativos sem nenhuma execução. */
export function resourceRows(macros: Macro[], triggers: Trigger[]): ResourceRow[] {
  const activeM = macros.filter((m) => m.active);
  const activeT = triggers.filter((t) => t.active);
  return [
    { id: 'macros', name: 'Macros', active: activeM.length, runs24h: Math.round(activeM.reduce((n, m) => n + m.usage7d, 0) / 7), unused30d: activeM.filter((m) => m.usage7d === 0).length },
    { id: 'triggers', name: 'Gatilhos', active: activeT.length, runs24h: Math.round(activeT.reduce((n, t) => n + t.fired7d, 0) / 7), unused30d: activeT.filter((t) => t.fired7d === 0).length },
  ];
}

const COLUMNS: ColumnDef<ResourceRow>[] = [
  { id: 'name', header: 'Recurso', label: 'Recurso', cell: (r) => <span className="font-semibold">{r.name}</span>, width: 220 },
  { id: 'active', header: 'Ativos', label: 'Ativos', cell: (r) => r.active, width: 140 },
  { id: 'runs', header: 'Execuções (24 h)', label: 'Execuções (24 h)', cell: (r) => r.runs24h.toLocaleString('pt-BR'), width: 180 },
  { id: 'unused', header: 'Sem uso (30 d)', label: 'Sem uso (30 d)', cell: (r) => r.unused30d, width: 180 },
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
        { id: 'agents', label: 'Agentes', value: data.licenses.used, max: data.licenses.total },
        { id: 'fields', label: 'Campos personalizados', value: data.fields.filter((f) => !f.system && f.active).length, max: LIMITS.fields },
        { id: 'triggers', label: 'Gatilhos ativos', value: data.triggers.filter((t) => t.active).length, max: LIMITS.triggers },
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
                  </li>
                ))}
          </ul>
          )}
        </section>

        <section aria-labelledby="home-recursos">
          <h2 id="home-recursos" className="mb-2 text-md font-semibold">
            Uso de recursos
          </h2>
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
