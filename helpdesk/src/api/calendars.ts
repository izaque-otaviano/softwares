import type { BusinessCalendar, CalendarInput, Holiday, HolidayInput } from '@/types/admin-a';
import { calendars as mock } from './mock/adminA';
import { IS_REAL } from './mode';
import * as real from './real/calendars';

export const listCalendars = (): Promise<BusinessCalendar[]> => (IS_REAL ? real.listCalendars() : mock.list());
export const saveCalendar = (input: CalendarInput): Promise<BusinessCalendar> => (IS_REAL ? real.saveCalendar(input) : mock.save(input));
export const deleteCalendar = (id: string): Promise<void> => (IS_REAL ? real.deleteCalendar(id) : mock.remove(id));
export const saveHoliday = (input: HolidayInput): Promise<Holiday> => (IS_REAL ? real.saveHoliday(input) : mock.saveHoliday(input));
export const deleteHoliday = (id: string): Promise<void> => (IS_REAL ? real.deleteHoliday(id) : mock.removeHoliday(id));
