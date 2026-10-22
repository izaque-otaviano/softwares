import * as mock from './mock/users';
import * as real from './real/users';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const {
  listUsers,
  getUser,
  updateUser,
  createUser,
  deleteUser,
  mergeUsers,
} = impl;
export type { UserFilter } from './mock/users';
