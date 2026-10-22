import { ChevronDown, ChevronRight, ChevronsUpDown, ChevronUp } from 'lucide-react';
import {
  Fragment,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/cn';
import { Banner } from './Banner';
import { Checkbox } from './Checkbox';
import { EmptyState } from './EmptyState';
import { Kebab } from './Kebab';
import type { MenuItemSpec } from './Menu';
import { Skeleton } from './Skeleton';
import { columnLabel, isErrorConfig, minWidthOf, MAX_COLUMN_WIDTH, nextSort } from './table/columns';
import { ResizeHandle } from './table/ResizeHandle';
import type { ColumnDef, SortDirection, SortState, TableEmptyConfig, TableErrorConfig, TableGroup } from './table/types';
import { useTableColumns } from './table/useTableColumns';

export { ColumnsMenu } from './table/ColumnsMenu';
export type { ColumnsMenuProps } from './table/ColumnsMenu';
export { useTableColumns } from './table/useTableColumns';
export type { UseTableColumnsResult } from './table/useTableColumns';
export type { ColumnDef, SortDirection, SortState, TableEmptyConfig, TableErrorConfig, TableGroup } from './table/types';

export interface TableProps<T> {
  /** Chave de persistência de larguras e colunas visíveis (`useUi.tableColumns[id]`). */
  id: string;
  columns: ColumnDef<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  /** Texto/elemento, ou `{ message, onRetry }` para mostrar o botão "Tentar novamente". */
  error?: ReactNode | TableErrorConfig;
  /** Estado vazio. Padrão: "Nenhum item encontrado". */
  empty?: TableEmptyConfig;
  /** Controlada: a Table apenas mostra a seta e avisa em `onSortChange`; não reordena `rows`. */
  sort?: SortState | null;
  /** Recebe asc -> desc -> `null` a cada clique no mesmo cabeçalho. */
  onSortChange?: (sort: SortState | null) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Agrupa na ordem em que as chaves aparecem em `rows`. */
  groupBy?: (row: T) => TableGroup;
  /** Chaves de grupos que começam recolhidos. */
  defaultCollapsedGroups?: string[];
  /** Ações do kebab de cada linha (última coluna). Lista vazia = sem kebab naquela linha. */
  rowActions?: (row: T) => MenuItemSpec[];
  /** Clique na linha ou Enter com a linha focada. Controles dentro da linha (links, botões, kebab) não disparam. */
  onRowClick?: (row: T) => void;
  /** Alças de redimensionar (mouse e teclado) nos cabeçalhos. Larguras já salvas valem mesmo sem isto. */
  resizable?: boolean;
  /** Cabeçalho fixo no topo da área rolável (o contêiner precisa ter altura limitada, ex.: `className="h-full"`). */
  stickyHeader?: boolean;
  /** Descrição curta da linha para leitores de tela ("Ticket #12"): nome da caixa de seleção e do kebab. Extensão do contrato. */
  getRowLabel?: (row: T) => string;
  /** Aplicado ao contêiner rolável. */
  className?: string;
  'aria-label': string;
}

const SELECT_COLUMN_WIDTH = 40;
const ACTIONS_COLUMN_WIDTH = 48;
const SKELETON_ROWS = 8;

const ALIGN_TEXT = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const ALIGN_JUSTIFY = { left: 'justify-start', right: 'justify-end', center: 'justify-center' } as const;

/*
 * O padding horizontal NÃO entra nas constantes-base: `cn` não faz tailwind-merge, então `px-3` + `px-2` no mesmo elemento
 * disputam pela ordem do CSS e o cabeçalho de seleção ficava 4px fora do alinhamento das caixas das linhas.
 * Células de dados usam px-3; células de controle (caixa de seleção, kebab), px-2, no cabeçalho e no corpo.
 */
const HEADER_BASE = 'h-8 border-b border-line bg-surface text-xs font-semibold text-fg-muted';
const HEADER_CELL = `${HEADER_BASE} px-3`;
const HEADER_CONTROL_CELL = `${HEADER_BASE} px-2`;
const BODY_CELL = 'h-10 truncate border-b border-line px-3 text-sm text-fg';
/** Células de controle (caixa de seleção, kebab): sem `truncate`, senão o `text-overflow` desenha reticências ao lado do controle. */
const CONTROL_CELL = 'h-10 border-b border-line px-2';
/** Larguras alternadas (determinísticas) dos blocos do esqueleto, para parecer conteúdo real. */
const SKELETON_WIDTHS = ['70%', '45%', '85%', '60%'];
/** Barra azul de 3 px à esquerda da linha: hover, foco e seleção. */
const ROW_BAR =
  'relative before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-action before:opacity-0 group-hover/row:before:opacity-100 group-focus-visible/row:before:opacity-100 group-data-[selected=true]/row:before:opacity-100';

/** Cliques nestes elementos (ou dentro deles) pertencem a eles, não à linha. */
const INTERACTIVE_SELECTOR =
  'a[href],button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="menuitem"],[role="checkbox"],[role="switch"],[contenteditable="true"],[data-row-ignore]';

/** Largura útil da área rolável, para centralizar estados de largura total (vazio, erro) no que o usuário enxerga. */
function useClientWidth(ref: RefObject<HTMLElement>): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => setWidth(element.clientWidth > 0 ? element.clientWidth : undefined);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === 'asc') return <ChevronUp aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg" />;
  if (direction === 'desc') return <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg" />;
  return <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />;
}

/**
 * Tabela de dados: semântica nativa (`<table>`), layout fixo (sem layout shift entre carregando e dados),
 * ordenação controlada, seleção, agrupamento recolhível, kebab por linha e colunas redimensionáveis/ocultáveis.
 * Colunas sem `width` ocupam 160 px; o espaço que sobra no contêiner fica numa coluna de preenchimento.
 */
export function Table<T>({
  id,
  columns,
  rows,
  getRowId,
  loading = false,
  error,
  empty,
  sort = null,
  onSortChange,
  selectable = false,
  selectedIds,
  onSelectionChange,
  groupBy,
  defaultCollapsedGroups,
  rowActions,
  onRowClick,
  resizable = false,
  stickyHeader = false,
  getRowLabel,
  className,
  'aria-label': ariaLabel,
}: TableProps<T>) {
  const { columns: visibleColumns, widths, setWidth } = useTableColumns(id, columns);
  const [draft, setDraft] = useState<{ columnId: string; width: number } | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(defaultCollapsedGroups));
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportWidth = useClientWidth(scrollRef);
  const baseId = useId();

  const widthOf = (column: ColumnDef<T>): number => (draft?.columnId === column.id ? draft.width : widths[column.id]);
  const hasActions = rowActions !== undefined;
  const colCount = (selectable ? 1 : 0) + visibleColumns.length + 1 + (hasActions ? 1 : 0);
  const tableMinWidth =
    (selectable ? SELECT_COLUMN_WIDTH : 0) + visibleColumns.reduce((sum, column) => sum + widthOf(column), 0) + (hasActions ? ACTIONS_COLUMN_WIDTH : 0);

  /* ------------------------------ seleção ------------------------------ */

  const rowIds = useMemo(() => rows.map(getRowId), [rows, getRowId]);
  const selectedCount = selectedIds ? rowIds.filter((rowId) => selectedIds.has(rowId)).length : 0;
  const allSelectedState: boolean | 'indeterminate' =
    selectedCount === 0 ? false : selectedCount === rowIds.length ? true : 'indeterminate';

  const setRowsSelected = (ids: readonly string[], selected: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    for (const rowId of ids) {
      if (selected) next.add(rowId);
      else next.delete(rowId);
    }
    onSelectionChange(next);
  };

  /* ------------------------------ grupos ------------------------------- */

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const byKey = new Map<string, { key: string; label: ReactNode; rows: T[] }>();
    for (const row of rows) {
      const group = groupBy(row);
      const existing = byKey.get(group.key);
      if (existing) existing.rows.push(row);
      else byKey.set(group.key, { key: group.key, label: group.label, rows: [row] });
    }
    return Array.from(byKey.values());
  }, [rows, groupBy]);

  const toggleGroup = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /* ------------------------------ cabeçalho ---------------------------- */

  const headerPosition = stickyHeader ? 'sticky top-0 z-10' : 'relative';

  const renderHeaderCell = (column: ColumnDef<T>, index: number) => {
    const align = column.align ?? 'left';
    const direction = sort?.columnId === column.id ? sort.direction : null;
    const handleSort = column.sortable === true ? onSortChange : undefined;
    // Só o rótulo dá nome ao cabeçalho: a alça de redimensionar (role=separator) também mora dentro do <th> e,
    // sem isto, o nome ficava "Assunto Redimensionar coluna Assunto" a cada célula lida.
    const labelId = `${baseId}-h${index}`;
    const content = column.header === null || column.header === undefined || column.header === '' ? (
      <span className="sr-only">{columnLabel(column)}</span>
    ) : (
      column.header
    );
    return (
      <th
        key={column.id}
        scope="col"
        aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
        aria-labelledby={labelId}
        className={cn(HEADER_CELL, headerPosition, ALIGN_TEXT[align])}
      >
        <div className={cn('flex min-w-0 items-center', ALIGN_JUSTIFY[align])}>
          {handleSort ? (
            <button
              type="button"
              onClick={() => handleSort(nextSort(sort, column.id))}
              className="-mx-1 inline-flex h-6 min-w-0 max-w-full items-center gap-1 rounded px-1 text-xs font-semibold outline-none transition-colors duration-100 hover:bg-hover hover:text-fg focus-visible:shadow-focus"
            >
              <span id={labelId} className="truncate">
                {content}
              </span>
              <SortIcon direction={direction} />
            </button>
          ) : (
            <span id={labelId} className="min-w-0 truncate">
              {content}
            </span>
          )}
        </div>
        {resizable ? (
          <ResizeHandle
            label={columnLabel(column)}
            width={widthOf(column)}
            min={minWidthOf(column)}
            max={MAX_COLUMN_WIDTH}
            onPreview={(width) => setDraft(width === null ? null : { columnId: column.id, width })}
            onCommit={(width) => setWidth(column.id, width)}
          />
        ) : null}
      </th>
    );
  };

  /* -------------------------------- linhas ----------------------------- */

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick || event.defaultPrevented) return;
    const rowElement = event.currentTarget;
    const target = event.target;
    // Eventos de Portals (menu do kebab, tooltips) borbulham pela árvore do React, mas não estão dentro da linha.
    if (!(target instanceof Element) || !rowElement.contains(target)) return;
    const control = target.closest(INTERACTIVE_SELECTOR);
    if (control && rowElement.contains(control)) return;
    // Soltar o mouse ao fim de uma seleção de texto não deve abrir a linha.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.anchorNode && rowElement.contains(selection.anchorNode)) return;
    onRowClick(row);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    // Só quando a própria linha tem o foco: Enter num checkbox, link ou kebab é desses controles.
    if (!onRowClick || event.key !== 'Enter' || event.target !== event.currentTarget) return;
    event.preventDefault();
    onRowClick(row);
  };

  const renderDataRow = (row: T) => {
    const rowId = getRowId(row);
    const selected = selectedIds?.has(rowId) ?? false;
    const label = getRowLabel?.(row);
    const actions = rowActions?.(row) ?? [];
    return (
      <tr
        key={rowId}
        data-selected={selected || undefined}
        // A barra de 3px (ROW_BAR) é o indicador de foco da linha.
        data-focus-ring="custom"
        tabIndex={onRowClick ? 0 : undefined}
        onClick={(event) => handleRowClick(event, row)}
        onKeyDown={(event) => handleRowKeyDown(event, row)}
        className={cn(
          'group/row outline-none transition-colors duration-100 focus-visible:shadow-focus',
          selected ? 'bg-action-soft' : 'hover:bg-hover',
          onRowClick && 'cursor-pointer',
        )}
      >
        {selectable ? (
          <td data-row-ignore="" className={cn(CONTROL_CELL, ROW_BAR)}>
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => setRowsSelected([rowId], checked)}
              aria-label={label ? `Selecionar ${label}` : 'Selecionar linha'}
            />
          </td>
        ) : null}
        {visibleColumns.map((column, index) => (
          <td key={column.id} className={cn(BODY_CELL, ALIGN_TEXT[column.align ?? 'left'], !selectable && index === 0 && ROW_BAR)}>
            {column.cell(row)}
          </td>
        ))}
        <td aria-hidden="true" className="border-b border-line p-0" />
        {hasActions ? (
          <td data-row-ignore="" className={cn(CONTROL_CELL, 'text-right')}>
            {actions.length > 0 ? <Kebab items={actions} label={label ? `Mais ações: ${label}` : undefined} /> : null}
          </td>
        ) : null}
      </tr>
    );
  };

  const renderGroup = (group: { key: string; label: ReactNode; rows: T[] }) => {
    const expanded = !collapsed.has(group.key);
    return (
      <Fragment key={`group:${group.key}`}>
        <tr className="bg-surface-1">
          <td colSpan={colCount} className="border-b border-line p-0">
            <button
              type="button"
              aria-expanded={expanded}
              data-focus-ring="inset"
              onClick={() => toggleGroup(group.key)}
              style={viewportWidth ? { width: viewportWidth } : undefined}
              className="sticky left-0 flex h-8 w-full items-center gap-2 px-3 text-left text-xs font-semibold text-fg outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus"
            >
              {expanded ? (
                <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
              ) : (
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
              )}
              <span className="min-w-0 truncate">
                {group.label} ({group.rows.length})
              </span>
            </button>
          </td>
        </tr>
        {expanded ? group.rows.map(renderDataRow) : null}
      </Fragment>
    );
  };

  /* --------------------------------- corpo ----------------------------- */

  const fullWidthStyle = viewportWidth ? { width: viewportWidth } : undefined;
  const errorConfig = isErrorConfig(error) ? error : null;
  const hasError = errorConfig !== null || (error !== undefined && error !== null && error !== false && error !== '');

  let body: ReactNode;
  if (loading) {
    // Uma <td> real por coluna (mesmo colgroup, mesmas alturas e paddings das linhas de dados): nada se mexe quando os dados chegam.
    body = Array.from({ length: SKELETON_ROWS }, (_, r) => (
      <tr key={r} data-skeleton-row="">
        {selectable ? (
          <td className={CONTROL_CELL}>
            <Skeleton className="h-4 w-4" />
          </td>
        ) : null}
        {visibleColumns.map((column, c) => (
          <td key={column.id} className={cn(BODY_CELL, ALIGN_TEXT[column.align ?? 'left'])}>
            {r === 0 && c === 0 ? <span role="status" className="sr-only">Carregando...</span> : null}
            <Skeleton width={SKELETON_WIDTHS[(r * 3 + c) % SKELETON_WIDTHS.length]} className={cn(column.align === 'right' && 'ml-auto', column.align === 'center' && 'mx-auto')} />
          </td>
        ))}
        <td aria-hidden="true" className="border-b border-line p-0" />
        {hasActions ? <td className={CONTROL_CELL} /> : null}
      </tr>
    ));
  } else if (hasError) {
    body = (
      <tr>
        <td colSpan={colCount} className="border-b border-line p-0">
          <div className="sticky left-0 p-3" style={fullWidthStyle}>
            <Banner tone="error" onRetry={errorConfig?.onRetry}>
              {errorConfig ? errorConfig.message : (error as ReactNode)}
            </Banner>
          </div>
        </td>
      </tr>
    );
  } else if (rows.length === 0) {
    body = (
      <tr>
        <td colSpan={colCount} className="border-b border-line p-0">
          <div className="sticky left-0" style={fullWidthStyle}>
            <EmptyState
              illustration={empty?.illustration ?? 'box'}
              title={empty?.title ?? 'Nenhum item encontrado'}
              description={empty?.description}
              action={empty?.action}
            />
          </div>
        </td>
      </tr>
    );
  } else if (groups) {
    body = groups.map(renderGroup);
  } else {
    body = rows.map(renderDataRow);
  }

  return (
    // Grupo nomeado (sem virar landmark: a página pode ter várias tabelas) e focável só por script (tabindex -1): destino
    // do foco quando a linha que o tinha é apagada (atributo `data-focus-fallback`, ver focusUtils.ts e useDialogFocus).
    <div
      ref={scrollRef}
      role="group"
      aria-label={ariaLabel}
      tabIndex={-1}
      data-focus-fallback=""
      className={cn('relative min-h-0 w-full overflow-auto outline-none', className)}
    >
      <table
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        style={{ minWidth: tableMinWidth }}
        className="w-full table-fixed border-separate border-spacing-0 text-sm"
      >
        <colgroup>
          {selectable ? <col style={{ width: SELECT_COLUMN_WIDTH }} /> : null}
          {visibleColumns.map((column) => (
            <col key={column.id} style={{ width: widthOf(column) }} />
          ))}
          <col />
          {hasActions ? <col style={{ width: ACTIONS_COLUMN_WIDTH }} /> : null}
        </colgroup>
        <thead>
          <tr>
            {selectable ? (
              <th scope="col" className={cn(HEADER_CONTROL_CELL, headerPosition)}>
                <Checkbox
                  checked={allSelectedState}
                  disabled={loading || rowIds.length === 0}
                  onCheckedChange={(checked) => setRowsSelected(rowIds, checked)}
                  aria-label="Selecionar todas as linhas"
                />
              </th>
            ) : null}
            {visibleColumns.map((column, index) => renderHeaderCell(column, index))}
            <th aria-hidden="true" className={cn('h-8 border-b border-line bg-surface p-0', headerPosition)} />
            {hasActions ? (
              <th scope="col" className={cn(HEADER_CONTROL_CELL, headerPosition)}>
                <span className="sr-only">Ações</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}
