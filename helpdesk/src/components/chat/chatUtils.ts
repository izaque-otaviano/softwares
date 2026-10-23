import { differenceInMinutes, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { shortDuration } from '@/lib/time';
import type { Chat, ChatMessage, ChatPriority, ChatStatus } from '@/types/chat';

export const STATUS_LABEL: Record<ChatStatus, string> = { queued: 'Na fila', active: 'Em atendimento', closed: 'Encerrada' };

export const PRIORITY_LABEL: Record<ChatPriority, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

/** "6 min", "1h 20m": há quanto tempo o cliente espera (fila) ou conversa. */
export function waitLabel(fromIso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, differenceInMinutes(now, new Date(fromIso)));
  return minutes < 1 ? 'agora' : shortDuration(minutes);
}

/** Texto curto da posição na fila: "1º da fila", "3º da fila, espera de cerca de 9 min". */
export function queueLabel(chat: Pick<Chat, 'queue'>): string | null {
  const q = chat.queue;
  if (!q) return null;
  const base = `${q.position}º da fila`;
  if (!q.queueOpen) return `${base}, fila fechada`;
  return q.estimatedWaitMinutes ? `${base}, espera de cerca de ${q.estimatedWaitMinutes} min` : base;
}

/** Hora curta da mensagem: "14:05". */
export const clockTime = (iso: string): string => format(new Date(iso), 'HH:mm', { locale: ptBR });

/** Cabeçalho do dia na conversa: "hoje", "ontem" ou "12 de out. de 2026". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return 'Hoje';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (same(d, yesterday)) return 'Ontem';
  return format(d, "d 'de' MMM 'de' yyyy", { locale: ptBR });
}

export const dayKey = (iso: string): string => format(new Date(iso), 'yyyy-MM-dd');

/**
 * Variáveis das macros e respostas: `{{solicitante}}` = primeiro nome do cliente, `{{empresa}}` = empresa.
 * O backend não substitui nada no chat (a macro de chat só preenche os campos do atendimento), então é aqui.
 */
export function fillTemplate(text: string, chat: Pick<Chat, 'clientName' | 'companyName'> | null): string {
  if (!chat) return text;
  const first = chat.clientName.trim().split(/\s+/)[0] ?? '';
  return text.replace(/\{\{\s*(solicitante|nome_do_cliente)\s*\}\}/g, first).replace(/\{\{\s*empresa\s*\}\}/g, chat.companyName);
}

/** Estado de entrega de uma mensagem enviada por quem atende. */
export function deliveryState(m: Pick<ChatMessage, 'state' | 'readAt' | 'deliveredAt'>): 'sending' | 'failed' | 'read' | 'delivered' | 'sent' {
  if (m.state === 'sending') return 'sending';
  if (m.state === 'failed') return 'failed';
  if (m.readAt) return 'read';
  if (m.deliveredAt) return 'delivered';
  return 'sent';
}

export const DELIVERY_LABEL = { sending: 'Enviando', failed: 'Falha ao enviar', read: 'Lida', delivered: 'Entregue', sent: 'Enviada' } as const;

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Baixa um Blob no navegador. */
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
