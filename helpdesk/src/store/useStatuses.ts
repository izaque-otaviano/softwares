import { useEffect } from 'react';
import { DEFAULT_STATUSES } from '@/lib/status';
import type { TicketStatus } from '@/types/domain';
import { useTickets } from './useTickets';

/**
 * Fonte única dos status do ticket: `useTickets.statuses`. O admin escreve por `saveStatus` (que troca o array
 * da store) e BottomBar, StatusBadge, Home, Views e filtros leem da mesma store, então a mudança aparece sem recarregar.
 */
export function useStatuses(opts: { ensureLoaded?: boolean } = {}): TicketStatus[] {
  const statuses = useTickets((s) => s.statuses);
  const ensure = opts.ensureLoaded === true && statuses.length === 0;
  useEffect(() => {
    if (ensure) void useTickets.getState().loadStatuses();
  }, [ensure]);
  return statuses.length ? statuses : DEFAULT_STATUSES;
}

export const saveStatus = (status: Omit<TicketStatus, 'id'> & { id?: string }) => useTickets.getState().saveStatus(status);
