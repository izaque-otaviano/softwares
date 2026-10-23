import * as mock from './mock/notifications';
import * as real from './real/notifications';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const { getPreferences, savePreferences, listNotifications, markNotificationRead, markAllNotificationsRead } = impl;
