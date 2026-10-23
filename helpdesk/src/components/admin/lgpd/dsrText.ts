import type { DataSubjectRequest, DsrKind, DsrStatus } from '@/types/admin-b';
import type { PillTone } from '@/components/ui';

export const KIND_LABEL: Record<DsrKind, string> = {
  export: 'Exportação de dados',
  anonymize: 'Anonimização',
  rectify: 'Retificação',
};

export const STATUS_LABEL: Record<DsrStatus, string> = {
  pending: 'Pendente',
  approved: 'Identidade verificada',
  running: 'Em execução',
  done: 'Concluído',
  failed: 'Falhou',
  rejected: 'Rejeitado',
};

export const STATUS_TONE: Record<DsrStatus, PillTone> = {
  pending: 'note',
  approved: 'action',
  running: 'action',
  done: 'neutral',
  failed: 'danger',
  rejected: 'neutral',
};

export const isOpen = (r: Pick<DataSubjectRequest, 'status'>): boolean => ['pending', 'approved', 'running'].includes(r.status);

/** Identificador que a pessoa digita para confirmar ações irreversíveis. */
export const requestIdentifier = (r: Pick<DataSubjectRequest, 'id'>): string => `LGPD-${r.id}`;

export function subjectName(r: DataSubjectRequest): string {
  if (r.subjectUserName) return r.subjectUserName;
  if (r.subjectCompanyName) return `${r.subjectCompanyName} (empresa)`;
  return 'Titular removido';
}

export function deadlineText(r: DataSubjectRequest): string {
  if (!isOpen(r) || r.daysLeft === undefined) return '—';
  if (r.isOverdue || r.daysLeft < 0) {
    const d = Math.abs(r.daysLeft);
    return `Atrasado há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  }
  if (r.daysLeft === 0) return 'Vence hoje';
  return `${r.daysLeft} ${r.daysLeft === 1 ? 'dia' : 'dias'}`;
}

/**
 * Regras do backend para `execute`: anonimização exige identidade verificada (aprovado) ou nova tentativa (falhou);
 * exportação pode sair de pendente, aprovado ou falhou.
 */
export function canExecute(r: DataSubjectRequest): boolean {
  return r.kind === 'anonymize' ? ['approved', 'failed'].includes(r.status) : ['pending', 'approved', 'failed'].includes(r.status);
}

export function executeBlockedReason(r: DataSubjectRequest): string | undefined {
  if (canExecute(r)) return undefined;
  if (r.kind === 'anonymize' && r.status === 'pending') return 'Anonimização exige verificação de identidade antes de executar.';
  return 'Este pedido já foi processado ou está em execução.';
}
