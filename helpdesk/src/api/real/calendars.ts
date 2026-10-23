import type { BusinessCalendar, CalendarInput, Holiday, HolidayInput } from '@/types/admin-a';
import { ApiError } from '../errors';
import { adminALocal } from './adminLocal';
import { http } from './http';
import { mapCalendar, mapHoliday, type CalendarDto, type HolidayDto } from './mappers/adminA';
import { listAll } from './refs';

/**
 * Calendários: `/settings/calendars/` (janelas por dia da semana, fuso, padrão; os feriados vêm aninhados) e
 * `/settings/holidays/` (data, nome e, opcional, janela de meio período). "Repete todo ano" não existe no backend.
 */
const withLocalHoliday = (h: Holiday): Holiday => ({ ...h, recurring: adminALocal.holidayRecurring.get(h.id) ?? false });

export async function listCalendars(): Promise<BusinessCalendar[]> {
  const rows = await listAll<CalendarDto>('/settings/calendars/');
  return rows.map(mapCalendar).map((c) => ({ ...c, holidays: c.holidays.map(withLocalHoliday) }));
}

export async function saveCalendar(input: CalendarInput): Promise<BusinessCalendar> {
  const body = { name: input.name.trim(), timezone: input.timezone, is_default: input.isDefault, workdays: input.windows };
  const dto = input.id ? await http.patch<CalendarDto>(`/settings/calendars/${input.id}/`, body) : await http.post<CalendarDto>('/settings/calendars/', body);
  const c = mapCalendar(dto);
  return { ...c, holidays: c.holidays.map(withLocalHoliday) };
}

export async function deleteCalendar(id: string): Promise<void> {
  await http.delete(`/settings/calendars/${id}/`);
}

export async function saveHoliday(input: HolidayInput): Promise<Holiday> {
  const body = { calendar: Number(input.calendarId), date: input.date, name: input.name.trim(), start_time: input.start, end_time: input.end };
  let dto: HolidayDto;
  try {
    dto = input.id ? await http.patch<HolidayDto>(`/settings/holidays/${input.id}/`, body) : await http.post<HolidayDto>('/settings/holidays/', body);
  } catch (e) {
    // O backend responde "Os campos calendar, date devem criar um set único.": diz o mesmo em português claro.
    if (e instanceof ApiError && e.status === 400 && /set único|unique set/i.test(e.message)) {
      throw new ApiError('Já existe um feriado nesta data neste calendário. Edite o existente ou escolha outra data.', { status: 400, fieldErrors: e.fieldErrors, body: e.body });
    }
    throw e;
  }
  const saved = mapHoliday(dto);
  adminALocal.holidayRecurring.set(saved.id, input.recurring);
  return withLocalHoliday(saved);
}

export async function deleteHoliday(id: string): Promise<void> {
  await http.delete(`/settings/holidays/${id}/`);
  adminALocal.holidayRecurring.delete(id);
}
