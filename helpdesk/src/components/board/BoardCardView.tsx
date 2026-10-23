import { CalendarClock, MessageSquare, MoreVertical, Paperclip } from 'lucide-react';
import { useId, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Avatar, IconButton, Menu, MenuContent, MenuItems, MenuLabel, MenuSeparator, MenuTrigger, SlaPill, StatusDot, type MenuItemSpec } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PRIORITY_LABEL, statusColor } from '@/lib/status';
import type { BoardCard, BoardColumn } from '@/types/board';
import type { Priority } from '@/types/domain';
import { dueText } from './boardModel';

const PRIORITY_TONE: Record<Priority, string> = {
  urgent: 'bg-sla-breach text-sla-breachText',
  high: 'bg-sla-warn text-sla-warnText',
  normal: 'bg-surface-2 text-fg-muted',
  low: 'bg-surface-2 text-fg-muted',
};

export interface BoardCardViewProps {
  card: BoardCard;
  /** Coluna onde o cartão está. */
  column: BoardColumn;
  /** Coluna de status real do ticket (faixa lateral e rótulo de status). */
  stageColumn?: BoardColumn;
  /** Demais colunas para "Mover para…" (sem a atual e sem as de conclusão). */
  targets: BoardColumn[];
  canMove: boolean;
  busy: boolean;
  dragging: boolean;
  /** Posição (1 a n) e total na coluna, para o leitor de tela. */
  position: number;
  size: number;
  onOpen: () => void;
  onMove: (columnKey: string) => void;
  /** Passa para a coluna vizinha: -1 esquerda, 1 direita. */
  onShift: (delta: -1 | 1) => void;
  /** Reordena dentro da coluna: -1 sobe, 1 desce. */
  onReorder: (delta: -1 | 1) => void;
  onEditDue: () => void;
  onClearDue: () => void;
  onRelease: () => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}

/** Cartão de ticket: branco, faixa lateral na cor do status, arrastável e com alternativa de teclado. */
export function BoardCardView(p: BoardCardViewProps) {
  const { card, column, stageColumn } = p;
  const hintId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const stripe = stageColumn?.color ? statusColor(stageColumn.color) : undefined;
  const inLane = column.kind === 'lane';

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && p.canMove) {
      e.preventDefault();
      p.onShift(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && p.canMove) {
      e.preventDefault();
      p.onReorder(e.key === 'ArrowUp' ? -1 : 1);
    } else if ((e.key === 'm' || e.key === 'M') && !e.altKey && !e.ctrlKey && !e.metaKey && p.canMove) {
      e.preventDefault();
      setMenuOpen(true);
    }
  };

  const moveItems: MenuItemSpec[] = p.targets.map((t) => ({
    id: `move-${t.key}`,
    label: t.name,
    icon: t.color ? <StatusDot color={t.color} /> : <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-xs bg-ink" />,
    onSelect: () => p.onMove(t.key),
  }));
  const otherItems: MenuItemSpec[] = [
    { id: 'open', label: 'Abrir ticket', onSelect: p.onOpen },
    ...(p.canMove
      ? [
          { id: 'up', label: 'Subir na coluna', shortcut: 'Alt+↑', onSelect: () => p.onReorder(-1), disabled: p.position <= 1 },
          { id: 'down', label: 'Descer na coluna', shortcut: 'Alt+↓', onSelect: () => p.onReorder(1), disabled: p.position >= p.size },
          { id: 'due', label: card.dueAt ? 'Alterar prazo interno…' : 'Definir prazo interno…', onSelect: p.onEditDue },
          ...(card.dueAt ? [{ id: 'due-clear', label: 'Remover prazo interno', onSelect: p.onClearDue }] : []),
          ...(inLane && stageColumn ? [{ id: 'release', label: `Soltar para ${stageColumn.name}`, onSelect: p.onRelease }] : []),
        ]
      : []),
  ];

  return (
    <li className="list-none">
      <article
        data-ticket-id={card.ticketId}
        aria-busy={p.busy || undefined}
        draggable={p.canMove && !p.busy}
        onDragStart={p.onDragStart}
        onDragEnd={p.onDragEnd}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a, [role="menuitem"]')) return;
          p.onOpen();
        }}
        style={stripe ? { borderLeftColor: stripe } : undefined}
        className={cn(
          'group relative rounded border border-l-4 border-line bg-surface p-2.5 text-fg',
          'hover:border-line-strong focus-within:shadow-focus',
          p.canMove && 'cursor-grab active:cursor-grabbing',
          !stripe && 'border-l-line-strong',
          p.dragging && 'opacity-50',
          p.busy && 'opacity-70',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-semibold text-fg-muted">{card.reference}</span>
          <div className="flex items-center gap-1">
            <span className={cn('inline-flex h-5 items-center rounded px-1.5 text-2xs font-semibold', PRIORITY_TONE[card.priority])}>{PRIORITY_LABEL[card.priority]}</span>
            <Menu open={menuOpen} onOpenChange={setMenuOpen}>
              <MenuTrigger asChild>
                <IconButton label={`Ações de ${card.reference}: mover para…`} icon={<MoreVertical />} size="sm" />
              </MenuTrigger>
              <MenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {moveItems.length > 0 && p.canMove ? (
                  <>
                    <MenuLabel>Mover para…</MenuLabel>
                    <MenuItems items={moveItems} />
                    <MenuSeparator />
                  </>
                ) : null}
                <MenuItems items={otherItems} />
              </MenuContent>
            </Menu>
          </div>
        </div>

        <button
          type="button"
          data-card-open={card.ticketId}
          aria-describedby={hintId}
          onClick={p.onOpen}
          onKeyDown={onKeyDown}
          className="mt-1 block w-full rounded-xs text-left text-sm font-semibold text-fg outline-none focus-visible:shadow-focus"
        >
          <span className="sr-only">{`${card.reference}, posição ${p.position} de ${p.size} em ${column.name}. `}</span>
          <span className="line-clamp-2">{card.subject}</span>
        </button>
        <span id={hintId} className="sr-only">
          {p.canMove ? 'Enter abre o ticket. M abre Mover para. Alt com setas esquerda e direita muda de coluna; Alt com setas para cima e para baixo muda a ordem.' : 'Enter abre o ticket.'}
        </span>

        <p className="mt-1 truncate text-xs text-fg-muted">
          {card.requesterName}
          {card.companyName ? ` · ${card.companyName}` : ''}
        </p>

        {inLane && stageColumn ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
            <StatusDot color={stageColumn.color} />
            <span className="truncate">Status: {stageColumn.name}</span>
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.sla ? <SlaPill compact dueAt={card.sla.dueAt} state={card.sla.state} target={card.sla.target} /> : null}
          {card.dueAt ? (
            <span
              className={cn(
                'inline-flex h-4 items-center gap-0.5 rounded-pill px-1.5 text-2xs font-semibold',
                card.overdue ? 'bg-sla-breach text-sla-breachText' : 'bg-surface-2 text-fg',
              )}
              title={`Prazo interno: ${new Date(card.dueAt).toLocaleDateString('pt-BR')}${card.overdue ? ' (atrasado)' : ''}`}
            >
              <CalendarClock aria-hidden className="h-2.5 w-2.5" />
              <span>{card.overdue ? `Atrasado: ${dueText(card.dueAt)}` : `Prazo: ${dueText(card.dueAt)}`}</span>
            </span>
          ) : null}
          {card.messageCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-2xs text-fg-muted" title={`${card.messageCount} mensagens`}>
              <MessageSquare aria-hidden className="h-3 w-3" />
              <span aria-label={`${card.messageCount} mensagens`}>{card.messageCount}</span>
            </span>
          ) : null}
          {card.attachmentCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-2xs text-fg-muted" title={`${card.attachmentCount} anexos`}>
              <Paperclip aria-hidden className="h-3 w-3" />
              <span aria-label={`${card.attachmentCount} anexos`}>{card.attachmentCount}</span>
            </span>
          ) : null}
          <span className="ml-auto">
            {card.assigneeName ? <Avatar name={card.assigneeName} src={card.assigneeAvatar} size={24} title={card.assigneeName} /> : <span className="text-2xs text-fg-muted">Sem responsável</span>}
          </span>
        </div>
      </article>
    </li>
  );
}
