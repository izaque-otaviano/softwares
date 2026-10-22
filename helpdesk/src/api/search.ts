import * as mock from './mock/search';
import * as real from './real/search';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const {
  search,
  recentViewed,
  trackViewed,
} = impl;
export type { RecentItem } from './mock/search';
