import { ArrowDown, ArrowUp } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { IconButton } from '@/components/ui';
import type { Trigger } from '@/types/domain';

export interface OrderEditorProps {
  items: Trigger[];
  onChange: (next: Trigger[]) => void;
}

/** Lista reordenável por botões ou por Alt + setas. A ordem é a de avaliação dos gatilhos. */
export function OrderEditor({ items, onChange }: OrderEditorProps) {
  const listRef = useRef<HTMLOListElement>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
    const id = item!.id;
    // devolve o foco à linha movida depois do render
    queueMicrotask(() => listRef.current?.querySelector<HTMLElement>(`[data-order-id="${id}"]`)?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (e.target !== e.currentTarget || !e.altKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, index - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, index + 1);
    }
  };

  return (
    <ol ref={listRef} aria-label="Ordem de avaliação dos gatilhos" className="rounded border border-line">
      {items.map((t, i) => (
        <li
          key={t.id}
          data-order-id={t.id}
          tabIndex={0}
          onKeyDown={(e) => onKeyDown(e, i)}
          aria-label={`${i + 1}. ${t.name}. Use Alt mais seta para cima ou para baixo para mover.`}
          className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm outline-none last:border-b-0 focus-visible:shadow-focus"
        >
          <span className="w-6 text-right text-xs text-fg-muted">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
          <span className="text-xs text-fg-muted">{t.category}</span>
          <IconButton size="sm" label={`Mover ${t.name} para cima`} icon={<ArrowUp />} disabled={i === 0} onClick={() => move(i, i - 1)} />
          <IconButton size="sm" label={`Mover ${t.name} para baixo`} icon={<ArrowDown />} disabled={i === items.length - 1} onClick={() => move(i, i + 1)} />
        </li>
      ))}
    </ol>
  );
}
