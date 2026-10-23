import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { count } from './format';

export interface PagerProps {
  total: number;
  limit: number;
  offset: number;
  onOffset: (offset: number) => void;
  loading?: boolean;
  label?: string;
}

/** Paginação do servidor: "26–50 de 57" com Anterior e Próxima. */
export function Pager({ total, limit, offset, onOffset, loading, label = 'Paginação' }: PagerProps) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(total, offset + limit);
  return (
    <nav aria-label={label} className="flex items-center justify-end gap-2 pt-3 text-sm text-fg-muted">
      <span aria-live="polite">
        {count(from)}–{count(to)} de {count(total)}
      </span>
      <IconButton label="Página anterior" icon={<ChevronLeft />} disabled={loading || offset <= 0} onClick={() => onOffset(Math.max(0, offset - limit))} />
      <IconButton label="Próxima página" icon={<ChevronRight />} disabled={loading || offset + limit >= total} onClick={() => onOffset(offset + limit)} />
    </nav>
  );
}
