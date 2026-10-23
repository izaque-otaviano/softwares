import type { BackupJob, BackupOverview, BackupSchedule, BackupScheduleInput } from '@/types/admin-a';
import { ApiError } from '../errors';
import { apiBaseUrl, http, toApiError } from './http';
import { mapBackups, mapJob, mapSchedule, scheduleToDto, type BackupsDto, type JobDto, type ScheduleDto } from './mappers/adminA';

/**
 * Ferramentas > Backups: `/ferramentas/backups/*` (só administrador, leitura inclusive). O backend NÃO aceita nome para
 * o backup (`resolv-AAAAMMDD-HHMMSS.sql.gz`), roda a tarefa em segundo plano (consultar `trabalhos/{id}`) e só
 * restaura com `{confirmacao: "RESTAURAR"}`.
 */
export const RESTORE_CONFIRMATION = 'RESTAURAR';

const enc = encodeURIComponent;

export async function getBackups(): Promise<BackupOverview> {
  return mapBackups(await http.get<BackupsDto>('/ferramentas/backups/'));
}

export async function createBackup(): Promise<BackupJob> {
  return mapJob(await http.post<JobDto>('/ferramentas/backups/'));
}

export async function getBackupJob(id: string): Promise<BackupJob> {
  return mapJob(await http.get<JobDto>(`/ferramentas/backups/trabalhos/${enc(id)}/`));
}

export async function deleteBackup(name: string): Promise<void> {
  await http.delete(`/ferramentas/backups/${enc(name)}/`);
}

/** DESTRUTIVO: o backend derruba os dados atuais e recria a partir do arquivo. Só a tela com confirmação forte chama. */
export async function restoreBackup(name: string): Promise<BackupJob> {
  return mapJob(await http.post<JobDto>(`/ferramentas/backups/${enc(name)}/restaurar/`, { confirmacao: RESTORE_CONFIRMATION }));
}

/** Baixa o arquivo (fica na trilha de auditoria como exportação). Devolve o conteúdo para o navegador salvar. */
export async function downloadBackup(name: string): Promise<{ blob: Blob; fileName: string }> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/ferramentas/backups/${enc(name)}/download/`, { credentials: 'include', headers: { Accept: '*/*' } });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua rede e tente novamente.', { status: 0, code: 'rede' });
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw toApiError(res.status, body, res.headers);
  }
  return { blob: await res.blob(), fileName: name };
}

export async function getBackupSchedule(): Promise<BackupSchedule> {
  return mapSchedule(await http.get<ScheduleDto>('/ferramentas/backups/agendamento/'));
}

export async function saveBackupSchedule(input: BackupScheduleInput): Promise<BackupSchedule> {
  return mapSchedule(await http.put<ScheduleDto>('/ferramentas/backups/agendamento/', scheduleToDto(input)));
}
