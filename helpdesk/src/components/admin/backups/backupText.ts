import type { BackupFile, BackupJob, BackupOrigin } from '@/types/admin-a';

export const ORIGIN_LABEL: Record<BackupOrigin, string> = { manual: 'Manual', agendado: 'Agendado', pre_restauracao: 'Segurança antes de restaurar' };

export const originLabel = (o: BackupOrigin | null): string => (o ? ORIGIN_LABEL[o] : 'Externo');

/** Tamanho legível: 85 KB, 12,4 MB, 1,2 GB. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const text = i === 0 || v >= 100 ? String(Math.round(v)) : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${text} ${units[i]}`;
}

/** De onde veio o arquivo: quem pediu (quando a tela sabe) ou o agendamento / o servidor. */
export function originSource(file: BackupFile, jobs: BackupJob[]): string {
  const job = jobs.find((j) => j.kind === 'backup' && j.fileName === file.name);
  if (job?.requestedBy) return job.requestedBy;
  if (file.origin === 'agendado') return 'Agendamento da tela';
  if (file.origin === null) return 'Fora da tela (timer do servidor)';
  return '—';
}

export const isActiveJob = (j: BackupJob | null | undefined): boolean => Boolean(j && (j.status === 'pendente' || j.status === 'rodando'));

/** Salva o conteúdo no computador (âncora temporária). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const WEEKDAY_CRON = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'] as const;
