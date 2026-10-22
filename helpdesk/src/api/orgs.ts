import * as mock from './mock/orgs';
import * as real from './real/orgs';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const {
  listOrgs,
  getOrg,
  updateOrg,
  createOrg,
  deleteOrg,
  mergeOrgs,
  listPlans,
} = impl;
export type { PlanOption } from './mock/orgs';
