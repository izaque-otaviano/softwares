import * as mock from './mock/reports';
import * as real from './real/reports';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const { getTicketsReport, getChatReport, exportTicketsCsv, panelSupports } = impl;
