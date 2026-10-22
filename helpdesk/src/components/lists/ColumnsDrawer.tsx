import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Calendar, GripVertical, Hash, List, Plus, Tag, Type, User as UserIcon, X } from 'lucide-react';
import { Button, Drawer, IconButton, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ALL_COLUMNS, columnMeta, type ColumnMeta } from './viewQuery';

export interface ColumnsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string[];
  onApply: (columns: string[]) => void;
}

const KIND_ICON: Record<ColumnMeta['kind'], typeof Type> = {
  status: Tag,
  text: Type,
  person: UserIcon,
  date: Calendar,
  select: List,
  number: Hash,
};

/** Gaveta “Gerenciar colunas”: reordenar (arrastar ou botões), remover e adicionar. */
export function ColumnsDrawer({ open, onOpenChange, value, onApply }: ColumnsDrawerProps) {
  const [draft, setDraft] = useState<string[]>(value);
  const [announce, setAnnounce] = useState('');
  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.length || from === to) return;
    const next = [...draft];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setDraft(next);
    setAnnounce(`${columnMeta(item)?.label ?? item} movida para a posição ${to + 1} de ${next.length}`);
  };

  const available = ALL_COLUMNS.filter((c) => !draft.includes(c.id));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Gerenciar colunas"
      footer={
        <>
          <button type="button" className="rounded px-1 text-sm text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <Button
            variant="primary"
            disabled={draft.length === 0}
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Aplicar
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-fg-muted">
        {available.length} de {ALL_COLUMNS.length} colunas restantes
      </p>
      <ul className="flex flex-col gap-1" aria-label="Colunas da visualização">
        {draft.map((id, index) => {
          const meta = columnMeta(id);
          const Icon = KIND_ICON[meta?.kind ?? 'text'];
          return (
            <li
              key={id}
              draggable
              onDragStart={(e) => {
                dragFrom.current = index;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(index);
              }}
              onDragLeave={() => setOverIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom.current !== null) move(dragFrom.current, index);
                dragFrom.current = null;
                setOverIndex(null);
              }}
              onDragEnd={() => {
                dragFrom.current = null;
                setOverIndex(null);
              }}
              className={cn(
                'flex h-10 items-center gap-1 rounded border border-line bg-surface pl-1 pr-1 text-sm',
                overIndex === index && 'border-action bg-action-soft',
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-fg-subtle" aria-hidden />
              <Icon className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate pl-1">{meta?.label ?? id}</span>
              <IconButton label={`Mover ${meta?.label} para cima`} icon={<ArrowUp />} size="sm" disabled={index === 0} onClick={() => move(index, index - 1)} />
              <IconButton label={`Mover ${meta?.label} para baixo`} icon={<ArrowDown />} size="sm" disabled={index === draft.length - 1} onClick={() => move(index, index + 1)} />
              <IconButton
                label={`Remover coluna ${meta?.label}`}
                icon={<X />}
                size="sm"
                disabled={draft.length === 1}
                onClick={() => {
                  setDraft(draft.filter((x) => x !== id));
                  setAnnounce(`Coluna ${meta?.label} removida`);
                }}
              />
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <div className="mt-3">
        <Menu>
          <MenuTrigger asChild>
            <Button variant="outline" leadingIcon={<Plus />} disabled={available.length === 0}>
              Adicionar coluna
            </Button>
          </MenuTrigger>
          <MenuContent>
            {available.map((c) => (
              <MenuItem key={c.id} onSelect={() => setDraft([...draft, c.id])}>
                {c.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    </Drawer>
  );
}
