import type { Announcement, AnnouncementInput, RefOption } from '@/types/admin-a';
import { announcements as mock } from './mock/adminA';
import { IS_REAL } from './mode';
import * as real from './real/announcements';

export const listAnnouncements = (opts: { manage?: boolean; history?: boolean } = {}): Promise<Announcement[]> => (IS_REAL ? real.listAnnouncements(opts) : mock.list(opts));
export const saveAnnouncement = (input: AnnouncementInput): Promise<Announcement> => (IS_REAL ? real.saveAnnouncement(input) : mock.save(input));
/** O backend não apaga aviso: desativa. */
export const deactivateAnnouncement = (id: string): Promise<void> => (IS_REAL ? real.deactivateAnnouncement(id) : mock.deactivate(id));
export const dismissAnnouncement = (id: string): Promise<void> => (IS_REAL ? real.dismissAnnouncement(id) : mock.dismiss(id));
export const getAudienceRefs = (): Promise<{ teams: RefOption[]; companies: RefOption[]; plans: RefOption[] }> => (IS_REAL ? real.getAudienceRefs() : mock.refs());
