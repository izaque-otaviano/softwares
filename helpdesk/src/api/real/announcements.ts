import type { Announcement, AnnouncementInput, RefOption } from '@/types/admin-a';
import { ApiError } from '../errors';
import { http } from './http';
import { announcementToDto, mapAnnouncement, mapRef, type AnnouncementDto, type TeamRefDto } from './mappers/adminA';
import { listAll } from './refs';

/**
 * Avisos: `/announcements/`. Leitura: qualquer usuário autenticado vê os avisos da SUA audiência (o backend filtra).
 * `manage=1` (quem tem `announcement.manage`) traz todos, de qualquer público; `history=1` inclui os encerrados e
 * desativados. Aviso não é apagado: DELETE só desativa. `dismiss` oculta o aviso para o próprio usuário.
 */
export async function listAnnouncements(opts: { manage?: boolean; history?: boolean } = {}): Promise<Announcement[]> {
  const rows = await listAll<AnnouncementDto>('/announcements/', { ...(opts.manage ? { manage: 1 } : {}), ...(opts.history ? { history: 1 } : {}) });
  return rows.map(mapAnnouncement);
}

export async function saveAnnouncement(input: AnnouncementInput): Promise<Announcement> {
  const body = announcementToDto(input);
  const dto = input.id ? await http.patch<AnnouncementDto>(`/announcements/${input.id}/`, body) : await http.post<AnnouncementDto>('/announcements/', body);
  return mapAnnouncement(dto);
}

export async function deactivateAnnouncement(id: string): Promise<void> {
  await http.delete(`/announcements/${id}/`);
}

export async function dismissAnnouncement(id: string): Promise<void> {
  await http.post(`/announcements/${id}/dismiss/`);
}

export async function getAudienceRefs(): Promise<{ teams: RefOption[]; companies: RefOption[]; plans: RefOption[] }> {
  // Quem só gerencia avisos (supervisor) pode não ler alguns cadastros: 403 vira lista vazia.
  const soft = (path: string) => listAll<TeamRefDto>(path).catch((e: unknown) => (e instanceof ApiError && e.status === 403 ? [] : Promise.reject(e)));
  const [teams, companies, plans] = await Promise.all([soft('/settings/teams/'), soft('/settings/companies/'), soft('/settings/plans/')]);
  return { teams: teams.map(mapRef), companies: companies.map(mapRef), plans: plans.map(mapRef) };
}
