import { Table, type ColumnDef } from '@/components/ui';
import type { ChatAgentRow, ChatCompanyRow, ChatReport } from '@/types/reports';
import { BarList, LineChart, type BarItem } from './charts';
import { ChartCard } from './ChartCard';
import { fmtInt, fmtMinutes, fmtScore, pct } from './format';
import { KpiGrid, type KpiItem } from './KpiGrid';
import { brDate, rangeLabel } from './periods';

const noScore = (n: number | null) => (n === null ? 'Sem avaliações' : fmtScore(n));

const agentColumns: ColumnDef<ChatAgentRow>[] = [
  { id: 'name', header: 'Responsável', label: 'Responsável', cell: (r) => r.name, width: 200 },
  { id: 'total', header: 'Chats atendidos', label: 'Chats atendidos', cell: (r) => fmtInt(r.total), align: 'right', width: 140 },
  { id: 'duration', header: 'Duração média', label: 'Duração média', cell: (r) => fmtMinutes(r.durationMinutes), align: 'right', width: 140 },
  { id: 'score', header: 'Nota média', label: 'Nota média', cell: (r) => noScore(r.scoreMean), align: 'right', width: 140 },
];

const companyColumns: ColumnDef<ChatCompanyRow>[] = [
  { id: 'label', header: 'Empresa', label: 'Empresa', cell: (r) => r.label, width: 200 },
  { id: 'total', header: 'Chats', label: 'Chats', cell: (r) => fmtInt(r.total), align: 'right', width: 90 },
  { id: 'closed', header: 'Fechados', label: 'Fechados', cell: (r) => fmtInt(r.closed), align: 'right', width: 100 },
  { id: 'converted', header: 'Viraram ticket', label: 'Viraram ticket', cell: (r) => fmtInt(r.converted), align: 'right', width: 130 },
  { id: 'unanswered', header: 'Não atendidos', label: 'Não atendidos', cell: (r) => fmtInt(r.unanswered), align: 'right', width: 130 },
  { id: 'wait', header: 'Espera média', label: 'Espera média', cell: (r) => fmtMinutes(r.waitMinutes), align: 'right', width: 130 },
  { id: 'duration', header: 'Duração média', label: 'Duração média', cell: (r) => fmtMinutes(r.durationMinutes), align: 'right', width: 130 },
  { id: 'service', header: 'Nota do atendimento', label: 'Nota do atendimento', cell: (r) => noScore(r.serviceScore), align: 'right', width: 160 },
  { id: 'resolution', header: 'Nota da solução', label: 'Nota da solução', cell: (r) => noScore(r.resolutionScore), align: 'right', width: 150 },
];

export function ChatTab({ report }: { report: ChatReport }) {
  const { metrics: m, filters: f } = report;
  const period = rangeLabel(f.from, f.to);
  const kpis: KpiItem[] = [
    { key: 'total', label: 'Chats encerrados', value: fmtInt(m.total), hint: 'Encerrados no período (a data conta pelo encerramento).' },
    { key: 'answered', label: 'Atendidos', value: fmtInt(m.answered), hint: pct(m.answered, m.total) ? `${pct(m.answered, m.total)} dos encerrados.` : 'Nenhum chat encerrado.' },
    { key: 'unanswered', label: 'Não atendidos', value: fmtInt(m.unanswered), hint: 'Ninguém pegou; viraram ticket por tempo de fila.' },
    { key: 'wait', label: 'Espera média na fila', value: fmtMinutes(m.waitMinutes.mean), hint: m.waitMinutes.median === null ? 'Só dos atendidos.' : `Mediana: ${fmtMinutes(m.waitMinutes.median)}. Só dos atendidos.` },
    { key: 'duration', label: 'Duração média', value: fmtMinutes(m.durationMinutes.mean), hint: m.durationMinutes.median === null ? 'Do aceite ao encerramento.' : `Mediana: ${fmtMinutes(m.durationMinutes.median)}. Do aceite ao encerramento.` },
    {
      key: 'rating',
      label: 'Avaliação do atendimento (0 a 10)',
      value: m.ratings.serviceMean === null ? 'Sem avaliações' : fmtScore(m.ratings.serviceMean),
      unavailable: m.ratings.serviceMean === null,
      hint: `${fmtInt(m.ratings.answered)} ${m.ratings.answered === 1 ? 'resposta' : 'respostas'}; ${fmtInt(m.ratings.unanswered)} sem avaliação.`,
    },
  ];
  const total = report.daily.reduce((a, d) => a + d.count, 0);
  const peak = report.daily.reduce((b, d) => (d.count > b.count ? d : b), report.daily[0] ?? { date: f.from, count: 0 });
  const agentBars: BarItem[] = report.byAgent.map((a) => ({ key: a.id, label: a.name, value: a.total, fill: 'fill-action' }));
  const reasonBars: BarItem[] = report.byReason.map((r) => ({ ...r, fill: 'fill-ink' }));
  const sum = (xs: { label: string; value: number }[]) => xs.slice(0, 4).map((x) => `${x.label}: ${fmtInt(x.value)}`).join('; ');

  return (
    <div className="space-y-4">
      <KpiGrid label="Indicadores do chat" items={kpis} />
      {m.total === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center">
          <p className="text-md font-semibold text-fg">Sem chats encerrados neste período</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">Nenhum chat foi encerrado entre {period}. Amplie o período (por exemplo, 30 dias) ou escolha outro responsável.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ChartCard
            className="lg:col-span-2"
            title="Chats encerrados por dia"
            description={`${fmtInt(total)} chats entre ${period}. Passe o mouse sobre o gráfico para ver o dia.`}
            chart={
              <LineChart
                dates={report.daily.map((d) => d.date)}
                ariaLabel={`Chats encerrados por dia, de ${brDate(f.from)} a ${brDate(f.to)}. Total ${fmtInt(total)}. Maior dia: ${brDate(peak.date)}, com ${fmtInt(peak.count)}.`}
                series={[{ key: 'chats', label: 'Chats encerrados', values: report.daily.map((d) => d.count), stroke: 'stroke-action', fill: 'fill-action', marker: 'circle' }]}
              />
            }
            tableId="reports-chat-daily"
            getRowId={(d) => d.date}
            tableRows={report.daily}
            tableColumns={[
              { id: 'date', header: 'Dia', label: 'Dia', cell: (d) => brDate(d.date), width: 140 },
              { id: 'count', header: 'Chats encerrados', label: 'Chats encerrados', cell: (d) => fmtInt(d.count), align: 'right', width: 160 },
            ]}
          />
          <ChartCard
            title="Chats atendidos por responsável"
            description={`Atendidos no período: ${sum(agentBars) || 'nenhum'}.`}
            chart={<BarList items={agentBars} ariaLabel={`Chats atendidos por responsável. ${sum(agentBars)}.`} />}
            empty={agentBars.length === 0 ? { title: 'Nenhum chat atendido', description: 'Os chats do período não foram pegos por ninguém.' } : undefined}
            tableId="reports-chat-agents"
            getRowId={(r) => r.id}
            tableRows={report.byAgent}
            tableColumns={agentColumns}
          />
          <ChartCard
            title="Chats por motivo"
            description={`Encerrados no período: ${sum(reasonBars) || 'nenhum'}.`}
            chart={<BarList items={reasonBars} ariaLabel={`Chats por motivo. ${sum(reasonBars)}.`} />}
            tableId="reports-chat-reasons"
            getRowId={(r) => r.key}
            tableRows={report.byReason}
            tableColumns={[
              { id: 'label', header: 'Motivo', label: 'Motivo', cell: (r) => r.label, width: 220 },
              { id: 'value', header: 'Chats', label: 'Chats', cell: (r) => fmtInt(r.value), align: 'right', width: 100 },
            ]}
          />
        </div>
      )}
      <section aria-labelledby="reports-chat-company" className="rounded-lg border border-line bg-surface p-4">
        <h3 id="reports-chat-company" className="text-md font-semibold text-fg">Chats por empresa, em todo o histórico</h3>
        <p className="mt-0.5 text-xs text-fg-muted">O backend não filtra esta tabela por período nem por responsável, então ela não bate com os cartões acima.</p>
        <div className="mt-3">
          <Table
            id="reports-chat-companies"
            aria-label="Chats por empresa, em todo o histórico"
            columns={companyColumns}
            rows={report.byCompany}
            getRowId={(r) => r.label}
            className="max-h-80"
            stickyHeader
            empty={{ title: 'Sem chats registrados', description: 'Quando houver chats, o resumo por empresa aparece aqui.' }}
          />
        </div>
      </section>
    </div>
  );
}
