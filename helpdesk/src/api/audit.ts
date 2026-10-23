import * as mock from './mock/audit';
import * as real from './real/audit';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const { listAuditLogs, getAuditLog, listTicketAccess, getTicketAccess } = impl;
