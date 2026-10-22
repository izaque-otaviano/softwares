import * as mock from './mock/tickets';
import * as real from './real/tickets';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const {
  viewContext,
  listTickets,
  getTicket,
  listViews,
  getViewCounts,
  runView,
  updateTicket,
  bulkUpdate,
  createTicket,
  applyAutomation,
  deleteTickets,
  mergeTickets,
  simulateIncomingTicket,
  simulateCustomerReply,
  initialViews,
  suggestResolutionWindow,
  viewPageMeta,
  createPersonalView,
  updatePersonalView,
  deletePersonalView,
} = impl;
export type { TicketFilter, TicketPatch, NewComment, NewTicketInput, BulkChange, BulkResult } from './mock/tickets';
