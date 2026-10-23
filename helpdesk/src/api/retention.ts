import * as mock from './mock/retention';
import * as real from './real/retention';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const { listRetentionRuns, getRetentionRun, simulateRetention, reviewRetentionRun } = impl;
