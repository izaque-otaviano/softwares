import { DEFAULT_STATUSES } from '@/lib/status';
import type { TicketStatus } from '@/types/domain';

export const statuses: TicketStatus[] = DEFAULT_STATUSES.map((s) => ({ ...s }));
