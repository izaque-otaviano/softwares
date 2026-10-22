/**
 * Canal pessoal do Resolv: `ws://…/ws/me/`.
 *
 * Autenticado pelo mesmo cookie de sessão (proxy do Vite em dev). O socket é
 * transporte, não fonte de verdade: em `ticket_event` o front revalida por REST.
 *
 * Eventos tratados:
 * - `ticket_event` { ticket_id, kind } → recarrega o ticket e contadores
 * - `notification` { kind, title, body?, ticket_id? } → toast + opcionalmente ticket
 * - `pong` → heartbeat
 * Demais (`chat_queued`, `ticket_presence`, …) são ignorados nesta versão do Helpdesk.
 */

export type TicketEventKind = string;

export interface MeTicketEvent {
  type: 'ticket_event';
  ticket_id: number;
  kind: TicketEventKind;
}

export interface MeNotification {
  type: 'notification';
  kind?: string;
  title?: string;
  body?: string;
  ticket_id?: number;
  chat_id?: number;
  preview?: string;
  author_name?: string;
  url?: string;
  [key: string]: unknown;
}

export type MeMessage = MeTicketEvent | MeNotification | { type: 'pong' } | { type: string; [key: string]: unknown };

export interface MeSocketHandlers {
  onTicketEvent?: (ev: MeTicketEvent) => void;
  onNotification?: (ev: MeNotification) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
}

/** Códigos de fechamento do `UserConsumer` (apps/chat/consumers.py). */
export const CLOSE_UNAUTHENTICATED = 4401;
export const CLOSE_FORBIDDEN = 4403;

const PING_MS = 25_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/** URL do canal pessoal: relativa (proxy) ou absoluta se `VITE_API_URL` apontar para outro host. */
export function meWsUrl(): string {
  const root = String(import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
  if (!root) {
    const proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof location !== 'undefined' ? location.host : '127.0.0.1:5173';
    return `${proto}//${host}/ws/me/`;
  }
  const u = new URL(root);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/ws/me/';
  u.search = '';
  u.hash = '';
  return u.toString();
}

export class MeSocket {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private handlers: MeSocketHandlers;

  constructor(handlers: MeSocketHandlers = {}) {
    this.handlers = handlers;
  }

  setHandlers(handlers: MeSocketHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.clearPing();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect(): void {
    if (this.stopped) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(meWsUrl());
    } catch (e) {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.startPing();
      this.handlers.onOpen?.();
    };

    ws.onmessage = (ev) => {
      let data: MeMessage;
      try {
        data = JSON.parse(String(ev.data)) as MeMessage;
      } catch {
        return;
      }
      if (!data || typeof data !== 'object' || !('type' in data)) return;
      if (data.type === 'pong') return;
      if (data.type === 'ticket_event' && typeof (data as MeTicketEvent).ticket_id === 'number') {
        this.handlers.onTicketEvent?.(data as MeTicketEvent);
        return;
      }
      if (data.type === 'notification') {
        this.handlers.onNotification?.(data as MeNotification);
      }
    };

    ws.onerror = (err) => {
      this.handlers.onError?.(err);
    };

    ws.onclose = (ev) => {
      // Um socket antigo (já substituído/parado) não pode apagar a referência do atual.
      if (this.ws === ws) {
        this.clearPing();
        this.ws = null;
      }
      this.handlers.onClose?.();
      // Sessão expirada (4401) ou sem permissão (4403): reconectar em loop não adianta; o 401 do REST derruba a sessão.
      if (ev && (ev.code === CLOSE_UNAUTHENTICATED || ev.code === CLOSE_FORBIDDEN)) {
        this.stopped = true;
        return;
      }
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private startPing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          /* ignore */
        }
      }
    }, PING_MS);
  }

  private clearPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }
}

/** Singleton do canal pessoal (uma conexão por aba). */
let shared: MeSocket | null = null;

export function getMeSocket(): MeSocket {
  if (!shared) shared = new MeSocket();
  return shared;
}

export function stopMeSocket(): void {
  shared?.stop();
  shared = null;
}
