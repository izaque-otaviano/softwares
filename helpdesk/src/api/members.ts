import * as mock from './mock/members';
import * as real from './real/members';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const {
  ROLE_LABEL,
  listMembers,
  getLicenses,
  setLicenseTotal,
  createMember,
  setMemberSuspended,
  listRoles,
  listGroupRows,
} = impl;
export type { StaffRole, Member, Licenses, RoleRow, GroupRow, NewMember } from './mock/members';
