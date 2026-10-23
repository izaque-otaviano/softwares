import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Banner, Button, Table, type ColumnDef, type SortState } from '@/components/ui';
import { absoluteTime } from '@/lib/time';
import type { Slice, TicketRow, TicketsReport } from '@/types/reports';
import { BarList, LegendItem, LineChart, type BarItem } from './charts';
import { ChartCard } from './ChartCard';
import { fmtInt, fmtScore, fmtSeconds, pct } from './format';
import { KpiGrid, type KpiItem } from './KpiGrid';
import { brDate, rangeLabel } from './periods';

const STATUS_FILL: Record<string, string> = {
  new: 'fill-status-new',
  open: 'fill-status-open',
  pending_customer: 'fill-status-pending',
  closed: 'fill-status-solved',
};
const STATUS_BG: Record<string, string> = {
  new: 'bg-status-new',
  open: 'bg-status-open',
  pending_customer: 'bg-status-pending',
  closed: 'bg-status-solved',
};

const sliceCols = (first: string, second: string): import('@/components/ui').ColumnDef<Slice>[] => [
  { id: 'label', header: first, label: first, cell: (r) => r.label, width: 220 },
  { id: 'value', header: second, label: second, cell: (r) => fmtInt(r.value), align: 'right', width: 120 },
];

const bars = (items: Slice[], fill: (s: Slice) => string): BarItem[] => items.map((s) => ({ ...s, fill: fill(s) }));

const summarize = (items: Slice[], unit: string): string => {
  if (items.length === 0) return 'sem dados';
  const total = items.reduce((s, i) => s + i.value, 0);
  return `${fmtInt(total)} ${unit}. ${items.slice(0, 4).map((i) => `${i.label}: ${fmtInt(i.value)}`).join('; ')}${items.length > 4 ? '; e mais' : ''}.`;
};

function kpisFor(r: TicketsReport): KpiItem[] {
  const p = r.panel;
  const s = r.summary;
  const open = s.total - s.closed;
  if (!p) {
    const gone = 'Indisponível com filtro de responsável ou empresa: o backend só calcula por período e equipe.';
    return [
      { key: 'total', label: 'Tickets no período', value: fmtInt(s.total), hint: 'Criados no período, com os filtros atuais.' },
      { key: 'closed', label: 'Fechados', value: fmtInt(s.closed), hint: 'Dos criados no período.' },
      { key: 'open', label: 'Em aberto', value: fmtInt(open), hint: 'Criados no período e ainda não fechados.' },
      { key: 'first', label: 'Primeira resposta (média)', value: fmtSeconds(s.avgFirstResponseSeconds), hint: 'Da abertura à primeira resposta.' },
      { key: 'cycle', label: 'Até o fechamento (média)', value: fmtSeconds(s.avgCycleSeconds), hint: 'Da abertura ao fechamento, só dos fechados.' },
      { key: 'sla', label: 'Cumprimento de SLA', value: '—', hint: gone, unavailable: true },
      { key: 'csat', label: 'Satisfação', value: '—', hint: gone, unavailable: true },
    ];
  }
  const slaCard = (key: string, label: string, b: { onTime: number; late: number }): KpiItem => {
    const base = b.onTime + b.late;
    const v = pct(b.onTime, base);
    return { key, label, value: v ?? '—', unavailable: v === null, hint: v === null ? 'Nenhum ticket com prazo de SLA definido e já avaliado no período.' : `${fmtInt(b.onTime)} de ${fmtInt(base)} com prazo definido foram no prazo.` };
  };
  const nonClosed = p.byStatus.filter((x) => x.key !== 'closed').reduce((a, x) => a + x.value, 0);
  return [
    { key: 'opened', label: 'Tickets abertos', value: fmtInt(p.opened.value ?? 0), hint: 'Criados no período.', variation: p.opened.variation },
    { key: 'resolved', label: 'Resolvidos', value: fmtInt(p.resolved.value ?? 0), hint: `Fechados no período; ${fmtInt(p.resolvedOnTime.value ?? 0)} no prazo.`, variation: p.resolved.variation },
    { key: 'open', label: 'Em aberto', value: fmtInt(nonClosed), hint: 'Criados no período e ainda não fechados.' },
    { key: 'first', label: 'Primeira resposta (média)', value: fmtSeconds(p.firstResponseSeconds.value), hint: 'Da abertura à primeira resposta pública.', variation: p.firstResponseSeconds.variation },
    { key: 'resolution', label: 'Solução (média)', value: fmtSeconds(p.resolutionSeconds.value), hint: 'Da abertura ao fechamento.', variation: p.resolutionSeconds.variation },
    slaCard('sla-res', 'SLA de solução cumprido', p.resolutionSla),
    slaCard('sla-first', 'SLA de primeira resposta cumprido', p.firstResponseSla),
    {
      key: 'csat',
      label: 'Satisfação (nota de 0 a 10)',
      value: p.csat.average === null ? 'Sem respostas' : fmtScore(p.csat.average),
      unavailable: p.csat.average === null,
      hint: `${fmtInt(p.csat.answers)} ${p.csat.answers === 1 ? 'resposta' : 'respostas'} para ${fmtInt(p.csat.resolved)} resolvidos.`,
    },
  ];
}

const PAGE = 50;

function StatusCell({ row }: { row: TicketRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-xs ${STATUS_BG[row.status] ?? 'bg-ink'}`} />
      {row.statusLabel}
    </span>
  );
}

const rowColumns: ColumnDef<TicketRow>[] = [
  { id: 'reference', header: 'Ticket', label: 'Ticket', sortable: true, width: 100, cell: (r) => r.reference },
  { id: 'subject', header: 'Assunto', label: 'Assunto', sortable: true, width: 280, cell: (r) => r.subject },
  { id: 'company', header: 'Empresa', label: 'Empresa', sortable: true, width: 160, cell: (r) => r.company },
  { id: 'team', header: 'Equipe', label: 'Equipe', sortable: true, width: 120, cell: (r) => r.team },
  { id: 'status', header: 'Status', label: 'Status', sortable: true, width: 160, cell: (r) => <StatusCell row={r} /> },
  { id: 'assignee', header: 'Responsável', label: 'Responsável', sortable: true, width: 150, cell: (r) => r.assignee || 'Sem responsável' },
  { id: 'source', header: 'Canal', label: 'Canal', sortable: true, width: 130, cell: (r) => r.sourceLabel },
  { id: 'createdAt', header: 'Criado em', label: 'Criado em', sortable: true, width: 150, cell: (r) => absoluteTime(r.createdAt) },
  { id: 'first', header: '1ª resposta', label: '1ª resposta', sortable: true, align: 'right', width: 120, cell: (r) => (r.firstResponseSeconds === null ? 'Sem resposta' : fmtSeconds(r.firstResponseSeconds)) },
  { id: 'cycle', header: 'Até fechar', label: 'Até fechar', sortable: true, align: 'right', width: 120, cell: (r) => (r.cycleSeconds === null ? 'Em aberto' : fmtSeconds(r.cycleSeconds)) },
];

const sortValue = (r: TicketRow, id: string): string | number => {
  switch (id) {
    case 'reference': return r.reference;
    case 'subject': return r.subject.toLowerCase();
    case 'company': return r.company.toLowerCase();
    case 'team': return r.team.toLowerCase();
    case 'status': return r.statusLabel;
    case 'assignee': return r.assignee.toLowerCase();
    case 'source': return r.sourceLabel;
    case 'first': return r.firstResponseSeconds ?? Number.POSITIVE_INFINITY;
    case 'cycle': return r.cycleSeconds ?? Number.POSITIVE_INFINITY;
    default: return r.createdAt;
  }
};

export function TicketsTab({ report, onExport, exporting }: { report: TicketsReport; onExport: () => void; exporting: boolean }) {
  const { filters: f, panel: p, summary: s } = report;
  const period = rangeLabel(f.from, f.to);
  const [sort, setSort] = useState<SortState | null>({ columnId: 'createdAt', direction: 'desc' });
  const [shown, setShown] = useState(PAGE);

  const sorted = useMemo(() => {
    if (!sort) return report.rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...report.rows].sort((a, b) => {
      const x = sortValue(a, sort.columnId);
      const y = sortValue(b, sort.columnId);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [report.rows, sort]);

  const timeline = p ? p.timeline : report.createdByDay.map((d) => ({ date: d.date, opened: d.count, resolved: 0 }));
  const dates = timeline.map((d) => d.date);
  const totalOpened = timeline.reduce((a, d) => a + d.opened, 0);
  const totalResolved = timeline.reduce((a, d) => a + d.resolved, 0);
  const peak = timeline.reduce((best, d) => (d.opened > best.opened ? d : best), timeline[0] ?? { date: f.from, opened: 0, resolved: 0 });
  const emptyPeriod = s.total === 0 && totalOpened === 0 && totalResolved === 0;
  const noData = {
    title: 'Sem tickets neste período',
    description: 'Nenhum ticket corresponde aos filtros entre ' + period + '. Amplie o período (por exemplo, 30 dias) ou use "Limpar filtros".',
  };
  const seriesLabel = p ? 'Abertos e resolvidos por dia' : 'Tickets criados por dia';
  const lineAria = `${seriesLabel}, de ${brDate(f.from)} a ${brDate(f.to)}. ${fmtInt(totalOpened)} abertos${p ? ` e ${fmtInt(totalResolved)} resolvidos` : ''}. Maior dia de abertura: ${brDate(peak.date)}, com ${fmtInt(peak.opened)}.`;

  const unavailable = { title: 'Indisponível com este filtro', description: 'O backend só traz esta distribuição por período e equipe. Limpe o filtro de responsável ou empresa para vê-la.' };
  const tableRows = <R,>(x: R[]) => x;

  return (
    <div className="space-y-4">
      {!p ? (
        <Banner tone="info" title="Parte dos indicadores não está disponível">
          Com filtro de responsável ou empresa, o backend entrega só o relatório detalhado. SLA, satisfação, prioridade, resolvidos por pessoa e a série de resolvidos aparecem quando esses filtros estão vazios.
        </Banner>
      ) : null}
      <KpiGrid label="Indicadores de tickets" items={kpisFor(report)} />

      {emptyPeriod ? (
        <div className="rounded-lg border border-line bg-surface">
          <div className="px-6 py-10 text-center">
            <p className="text-md font-semibold text-fg">{noData.title}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{noData.description}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ChartCard
            className="lg:col-span-2"
            title={seriesLabel}
            description={`${fmtInt(totalOpened)} abertos${p ? `, ${fmtInt(totalResolved)} resolvidos` : ''} entre ${period}. Passe o mouse sobre o gráfico para ver o dia.`}
            chart={
              <LineChart
                dates={dates}
                ariaLabel={lineAria}
                series={[
                  { key: 'opened', label: 'Abertos', values: timeline.map((d) => d.opened), stroke: 'stroke-action', fill: 'fill-action', marker: 'circle' },
                  ...(p ? [{ key: 'resolved', label: 'Resolvidos', values: timeline.map((d) => d.resolved), stroke: 'stroke-ink', fill: 'fill-ink', marker: 'square' as const, dashed: true }] : []),
                ]}
              />
            }
            legend={
              p ? (
                <>
                  <LegendItem swatch={<svg aria-hidden width="28" height="10"><line x1="0" x2="28" y1="5" y2="5" className="stroke-action" strokeWidth="2" /><circle cx="14" cy="5" r="4" className="fill-action" /></svg>}>Abertos (linha contínua, círculo)</LegendItem>
                  <LegendItem swatch={<svg aria-hidden width="28" height="10"><line x1="0" x2="28" y1="5" y2="5" className="stroke-ink" strokeWidth="2" strokeDasharray="6 4" /><rect x="10" y="1" width="8" height="8" className="fill-ink" /></svg>}>Resolvidos (linha tracejada, quadrado)</LegendItem>
                </>
              ) : undefined
            }
            tableId="reports-timeline"
            getRowId={(d) => d.date}
            tableRows={tableRows(timeline)}
            tableColumns={[
              { id: 'date', header: 'Dia', label: 'Dia', cell: (d) => brDate(d.date), width: 120 },
              { id: 'opened', header: 'Abertos', label: 'Abertos', cell: (d) => fmtInt(d.opened), align: 'right', width: 110 },
              ...(p ? [{ id: 'resolved', header: 'Resolvidos', label: 'Resolvidos', cell: (d: { resolved: number }) => fmtInt(d.resolved), align: 'right' as const, width: 110 }] : []),
            ]}
          />
          <ChartCard
            title="Tickets por status"
            description={`Dos tickets criados no período: ${summarize(s.byStatus, 'tickets')}`}
            chart={<BarList items={bars(s.byStatus, (x) => STATUS_FILL[x.key] ?? 'fill-ink')} ariaLabel={`Tickets por status. ${summarize(s.byStatus, 'tickets')}`} />}
            tableId="reports-status"
            getRowId={(x) => x.key}
            tableRows={s.byStatus}
            tableColumns={sliceCols('Status', 'Tickets')}
          />
          <ChartCard
            title="Tickets por prioridade"
            description={p ? `Dos tickets criados no período: ${summarize(p.byPriority, 'tickets')}` : 'Distribuição por prioridade.'}
            chart={p ? <BarList items={bars(p.byPriority, () => 'fill-action')} ariaLabel={`Tickets por prioridade. ${summarize(p.byPriority, 'tickets')}`} /> : null}
            empty={p ? undefined : unavailable}
            tableId="reports-priority"
            getRowId={(x) => x.key}
            tableRows={p?.byPriority ?? []}
            tableColumns={sliceCols('Prioridade', 'Tickets')}
          />
          <ChartCard
            title="Tickets por equipe"
            description={`Contados a partir das linhas do relatório: ${summarize(report.byTeam, 'tickets')}`}
            chart={<BarList items={bars(report.byTeam, () => 'fill-action')} ariaLabel={`Tickets por equipe. ${summarize(report.byTeam, 'tickets')}`} />}
            tableId="reports-team"
            getRowId={(x) => x.key}
            tableRows={report.byTeam}
            tableColumns={sliceCols('Equipe', 'Tickets')}
          />
          <ChartCard
            title="Tickets por canal"
            description={`Origem do ticket: ${summarize(s.bySource, 'tickets')}`}
            chart={<BarList items={bars(s.bySource, () => 'fill-ink')} ariaLabel={`Tickets por canal. ${summarize(s.bySource, 'tickets')}`} />}
            tableId="reports-source"
            getRowId={(x) => x.key}
            tableRows={s.bySource}
            tableColumns={sliceCols('Canal', 'Tickets')}
          />
          <ChartCard
            title="Resolvidos por responsável"
            description={p ? `Fechados no período: ${summarize(p.resolvedByAgent, 'tickets')}` : 'Fechados por pessoa.'}
            chart={p ? <BarList items={bars(p.resolvedByAgent, () => 'fill-action')} ariaLabel={`Resolvidos por responsável. ${summarize(p.resolvedByAgent, 'tickets')}`} /> : null}
            empty={!p ? unavailable : p.resolvedByAgent.length === 0 ? { title: 'Nenhum ticket resolvido', description: 'Ninguém fechou tickets neste período.' } : undefined}
            tableId="reports-agent"
            getRowId={(x) => x.label}
            tableRows={p?.resolvedByAgent ?? []}
            tableColumns={sliceCols('Responsável', 'Resolvidos')}
          />
        </div>
      )}

      <section aria-labelledby="reports-rows-title" className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="reports-rows-title" className="text-md font-semibold text-fg">Tickets do período</h3>
            <p className="mt-0.5 text-xs text-fg-muted">
              {fmtInt(report.rows.length)} {report.rows.length === 1 ? 'ticket criado' : 'tickets criados'} entre {period}. A exportação em CSV usa os mesmos filtros.
            </p>
          </div>
          <Button variant="outline" loading={exporting} onClick={onExport}>
            Exportar CSV
          </Button>
        </div>
        <div className="mt-3">
          <Table
            id="reports-tickets"
            aria-label="Tickets do período"
            columns={rowColumns}
            rows={sorted.slice(0, shown)}
            getRowId={(r) => r.reference}
            sort={sort}
            onSortChange={setSort}
            className="max-h-[28rem]"
            stickyHeader
            empty={{ title: 'Sem tickets neste período', description: 'Amplie o período ou limpe os filtros.' }}
          />
          {shown < sorted.length ? (
            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-fg-muted">
              <span>Mostrando {fmtInt(shown)} de {fmtInt(sorted.length)}</span>
              <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>Mostrar mais {PAGE}</Button>
            </div>
          ) : null}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-fg-muted">
          <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Tempos médios consideram só os tickets que têm o dado (por exemplo, só os que já tiveram resposta).
        </p>
      </section>
    </div>
  );
}
