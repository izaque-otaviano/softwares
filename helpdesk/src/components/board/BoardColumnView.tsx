import { AlertTriangle, ChevronLeft, ChevronRight, Gauge, Pencil, Pin, Trash2 } from 'lucide-react';
import { useRef, type DragEvent, type ReactNode } from 'react';
import { Kebab, type MenuItemSpec } from '@/components/ui';
import { cn } from '@/lib/cn';
import { statusColor } from '@/lib/status';
import { wipState, type ColumnView } from './boardModel';
import { onStatusColorClass } from './colorText';

export interface DropSpot {
  columnKey: string;
  /** Ticket antes do qual o cartão cairia; `null` = no fim. */
  beforeId: number | null;
}

export interface BoardColumnViewProps {
  view: ColumnView;
  filtered: boolean;
  canMove: boolean;
  canConfigure: boolean;
  isFirstLane: boolean;
  isLastLane: boolean;
  dragging: boolean;
  drop: DropSpot | null;
  onDropSpot: (spot: DropSpot | null) => void;
  onDrop: (spot: DropSpot) => void;
  onEditWip: () => void;
  onRename: () => void;
  onShiftLane: (delta: -1 | 1) => void;
  onDeleteLane: () => void;
  children: ReactNode;
}

/** Coluna: cabeçalho na cor do status, contagem, menu da coluna e a lista de cartões (alvo de soltar). */
export function BoardColumnView(p: BoardColumnViewProps) {
  const { column } = p.view;
  const listRef = useRef<HTMLUListElement>(null);
  const wip = wipState(column, p.view.total);
  const isLane = column.kind === 'lane';
  const headerStyle = column.color ? { backgroundColor: statusColor(column.color) } : undefined;
  const count = p.filtered ? `${p.view.cards.length} de ${p.view.total}` : String(p.view.total);

  const items: MenuItemSpec[] = [
    ...(p.canMove && !column.concludes ? [{ id: 'wip', label: column.wipLimit ? `Limite de trabalho: ${column.wipLimit}…` : 'Definir limite de trabalho…', icon: <Gauge />, onSelect: p.onEditWip }] : []),
    ...(isLane && p.canMove
      ? [
          { id: 'rename', label: 'Renomear coluna…', icon: <Pencil />, onSelect: p.onRename },
          { id: 'left', label: 'Mover para a esquerda', icon: <ChevronLeft />, onSelect: () => p.onShiftLane(-1), disabled: p.isFirstLane },
          { id: 'right', label: 'Mover para a direita', icon: <ChevronRight />, onSelect: () => p.onShiftLane(1), disabled: p.isLastLane },
          { id: 'delete', label: 'Excluir coluna…', icon: <Trash2 />, tone: 'danger' as const, onSelect: p.onDeleteLane },
        ]
      : []),
  ];

  /** Posição do soltar: antes do primeiro cartão cujo meio está abaixo do ponteiro. */
  const spotFor = (event: DragEvent): DropSpot => {
    const nodes = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-ticket-id]') ?? []);
    const hit = nodes.find((n) => {
      const r = n.getBoundingClientRect();
      return event.clientY < r.top + r.height / 2;
    });
    return { columnKey: column.key, beforeId: hit ? Number(hit.dataset.ticketId) : null };
  };

  const accepts = p.dragging && p.canMove;

  return (
    <section
      aria-label={`${column.name}: ${p.view.total} ${p.view.total === 1 ? 'ticket' : 'tickets'}${isLane ? ' (coluna de organização)' : ''}`}
      className="flex max-h-full w-72 shrink-0 flex-col"
      data-column-key={column.key}
    >
      <header
        style={headerStyle}
        className={cn(
          'flex min-h-10 items-center justify-between gap-2 rounded-t px-3 py-1.5',
          column.color ? onStatusColorClass(column.color) : 'bg-ink text-fg-inverse',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold" title={column.name}>{column.name}</h2>
          {isLane ? (
            <span className="shrink-0" role="img" aria-label="Coluna de organização: fixar aqui não muda o status" title="Coluna de organização: fixar aqui não muda o status">
              <Pin aria-hidden className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {column.wipLimit ? (
            <span
              className={cn(
                'inline-flex h-5 items-center gap-0.5 rounded-pill px-1.5 text-xs font-semibold',
                wip === 'over' ? 'bg-sla-breach text-sla-breachText' : wip === 'at' ? 'bg-sla-warn text-sla-warnText' : 'bg-surface text-fg',
              )}
              title={`Limite de trabalho: ${column.wipLimit}${wip === 'over' ? ' (ultrapassado)' : ''}`}
            >
              {wip === 'over' ? <AlertTriangle aria-hidden className="h-3 w-3" /> : null}
              <span>Limite {column.wipLimit}</span>
              {wip === 'over' ? <span className="sr-only"> ultrapassado</span> : null}
            </span>
          ) : null}
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-surface px-1.5 text-xs font-semibold text-fg">{count}</span>
          {items.length > 0 ? (
            <span className="rounded bg-surface">
              <Kebab label={`Ações da coluna ${column.name}`} items={items} size="sm" />
            </span>
          ) : null}
        </div>
      </header>
      <ul
        ref={listRef}
        aria-label={`Tickets em ${column.name}`}
        data-drop-column={column.key}
        onDragOver={(e) => {
          if (!accepts) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const spot = spotFor(e);
          if (p.drop?.columnKey !== spot.columnKey || p.drop.beforeId !== spot.beforeId) p.onDropSpot(spot);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) p.onDropSpot(null);
        }}
        onDrop={(e) => {
          if (!accepts) return;
          e.preventDefault();
          p.onDrop(spotFor(e));
        }}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-b border border-t-0 border-line bg-surface-1 p-2',
          accepts && p.drop?.columnKey === column.key && 'border-action bg-action-soft',
        )}
      >
        {p.view.cards.length === 0 ? (
          <li className="list-none px-2 py-6 text-center text-xs text-fg-muted">
            {column.concludes
              ? 'Coluna de conclusão. Para resolver um ticket, abra-o e use o fluxo de fechamento.'
              : p.filtered && p.view.total > 0
                ? 'Nenhum ticket com os filtros atuais.'
                : 'Nenhum ticket aqui.'}
          </li>
        ) : null}
        {p.children}
      </ul>
    </section>
  );
}
