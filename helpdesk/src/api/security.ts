import * as mock from './mock/security';
import * as real from './real/security';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const {
  getTwoFactorStatus,
  setupTwoFactor,
  confirmTwoFactor,
  requestDisableCode,
  disableTwoFactor,
  listMySessions,
  revokeMySession,
  getMyAccessHistory,
  changeMyPassword,
  listMyDataRequests,
  requestMyExport,
  getUserAccessHistory,
  revokeUserSession,
  revokeAllUserSessions,
} = impl;
