import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** "23/10/2026 09:15". Vazio ou inválido vira "—". */
export function dateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy HH:mm', { locale: ptBR });
}

export function dateOnly(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy', { locale: ptBR });
}

export const count = (n: number): string => n.toLocaleString('pt-BR');
