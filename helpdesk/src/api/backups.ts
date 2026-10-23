import type { BackupJob, BackupOverview, BackupSchedule, BackupScheduleInput } from '@/types/admin-a';
import { backups as mock } from './mock/adminA';
import { IS_REAL } from './mode';
import * as real from './real/backups';

export const RESTORE_CONFIRMATION = real.RESTORE_CONFIRMATION;
export const getBackups = (): Promise<BackupOverview> => (IS_REAL ? real.getBackups() : mock.get());
export const createBackup = (): Promise<BackupJob> => (IS_REAL ? real.createBackup() : mock.create());
export const getBackupJob = (id: string): Promise<BackupJob> => (IS_REAL ? real.getBackupJob(id) : mock.job(id));
export const deleteBackup = (name: string): Promise<void> => (IS_REAL ? real.deleteBackup(name) : mock.remove(name));
/** DESTRUTIVO: substitui os dados atuais pelos do arquivo. Só a tela, após confirmação forte, chama. */
export const restoreBackup = (name: string): Promise<BackupJob> => (IS_REAL ? real.restoreBackup(name) : mock.restore(name));
export const downloadBackup = (name: string): Promise<{ blob: Blob; fileName: string }> => (IS_REAL ? real.downloadBackup(name) : mock.download(name));
export const getBackupSchedule = (): Promise<BackupSchedule> => (IS_REAL ? real.getBackupSchedule() : mock.getSchedule());
export const saveBackupSchedule = (input: BackupScheduleInput): Promise<BackupSchedule> => (IS_REAL ? real.saveBackupSchedule(input) : mock.saveSchedule(input));
