import * as mock from './mock/triggers';
import * as real from './real/triggers';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const {
  listTriggers,
  getTrigger,
  saveTrigger,
  setTriggerActive,
  deleteTrigger,
  reorderTriggers,
  recordTriggerFires,
} = impl;
