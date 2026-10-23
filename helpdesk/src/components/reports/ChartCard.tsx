import { useId, useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Button, EmptyState, Table, type ColumnDef } from '@/components/ui';

export interface ChartCardProps<R> {
  title: string;
  /** Descrição textual do que o gráfico mostra (também lida por leitores de tela). */
  description: ReactNode;
  chart: ReactNode;
  legend?: ReactNode;
  tableId: string;
  tableColumns: ColumnDef<R>[];
  tableRows: R[];
  getRowId: (row: R) => string;
  /** Quando preenchido, no lugar do gráfico e da tabela. */
  empty?: { title: string; description: ReactNode };
  className?: string;
}

/** Cartão de gráfico: título, descrição, gráfico (ou a mesma série em tabela) e legenda. */
export function ChartCard<R>({ title, description, chart, legend, tableId, tableColumns, tableRows, getRowId, empty, className }: ChartCardProps<R>) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className={`min-w-0 rounded-lg border border-line bg-surface p-4 ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="text-md font-semibold text-fg">
            {title}
          </h3>
          <p id={`${id}-d`} className="mt-0.5 text-xs text-fg-muted">
            {description}
          </p>
        </div>
        {empty ? null : (
          <Button
            variant="outline"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
            leadingIcon={asTable ? <BarChart3 aria-hidden className="h-4 w-4" /> : <Table2 aria-hidden className="h-4 w-4" />}
            className="shrink-0"
          >
            {asTable ? 'Ver gráfico' : 'Ver como tabela'}
          </Button>
        )}
      </div>
      {empty ? (
        <EmptyState compact title={empty.title} description={empty.description} />
      ) : asTable ? (
        <div className="mt-3">
          <Table id={tableId} aria-label={`${title}, em tabela`} columns={tableColumns} rows={tableRows} getRowId={getRowId} stickyHeader className="max-h-80" />
        </div>
      ) : (
        <>
          <div className="mt-3">{chart}</div>
          {legend ? <ul aria-label="Legenda" className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{legend}</ul> : null}
        </>
      )}
    </section>
  );
}
