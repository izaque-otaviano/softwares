import type { ReactNode } from 'react';

/** Lista de pares rótulo/valor do detalhe em gaveta. Valores vazios viram "—". */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-fg-muted">{i.label}</dt>
          <dd className="min-w-0 break-words text-fg">{i.value === undefined || i.value === null || i.value === '' ? '—' : i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
