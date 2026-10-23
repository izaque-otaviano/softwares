import * as mock from './mock/meta';
import * as real from './real/meta';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const {
  listGroups,
  listStatuses,
  saveStatus,
} = impl;
