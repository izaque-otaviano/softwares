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
 * Eventos de chat (`chat_queued`, `chat_taken` e `notification` de tipo `chat_*`) vão para quem se inscreve com
 * `addChatListener` (a tela de Chat); os handlers de ticket acima não mudam.
 * Demais (`ticket_presence`, …) são ignorados nesta versão do Helpdesk.
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

/** Eventos de chat do canal pessoal (`UserConsumer`): fila, alguém pegou, aviso de mensagem/transferência. */
export type MeChatEvent =
  | { type: 'chat_queued'; chat_id: number; client_name?: string; company?: string; queued_at?: string }
  | { type: 'chat_taken'; chat_id: number; agent_id?: number }
  | { type: 'chat_notification'; kind: string; chat_id: number; preview?: string; author_name?: string; client_name?: string; company?: string };

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
  private chatListeners = new Set<(ev: MeChatEvent) => void>();
  private openListeners = new Set<() => void>();

  constructor(handlers: MeSocketHandlers = {}) {
    this.handlers = handlers;
  }

  /** Assina os eventos de chat. Devolve a função que cancela a assinatura. */
  addChatListener(fn: (ev: MeChatEvent) => void): () => void {
    this.chatListeners.add(fn);
    return () => this.chatListeners.delete(fn);
  }

  /** Avisa a cada (re)conexão aberta. Devolve a função que cancela a assinatura. */
  addOpenListener(fn: () => void): () => void {
    this.openListeners.add(fn);
    return () => this.openListeners.delete(fn);
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
      this.openListeners.forEach((fn) => fn());
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
      if (data.type === 'chat_queued' || data.type === 'chat_taken') {
        const raw = data as unknown as { chat_id?: unknown };
        if (typeof raw.chat_id === 'number') this.chatListeners.forEach((fn) => fn(data as unknown as MeChatEvent));
        return;
      }
      if (data.type === 'notification') {
        const note = data as MeNotification;
        if (typeof note.kind === 'string' && note.kind.startsWith('chat_') && typeof note.chat_id === 'number') {
          const ev = { ...note, type: 'chat_notification' } as unknown as MeChatEvent;
          this.chatListeners.forEach((fn) => fn(ev));
        }
        this.handlers.onNotification?.(note);
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

/* -------------------------------------------------------------------------- */
/* Sala de um chat: `ws://…/ws/chat/<id>/`                                     */
/* -------------------------------------------------------------------------- */

/** Códigos de fechamento do `ChatConsumer`: sem sessão, sem permissão, chat inexistente. Reconectar não adianta. */
export const CHAT_CLOSE_NOT_FOUND = 4404;

/** URL da sala: relativa (proxy) ou absoluta se `VITE_API_URL` apontar para outro host. */
export function chatWsUrl(chatId: string | number): string {
  const path = `/ws/chat/${encodeURIComponent(String(chatId))}/`;
  const root = String(import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
  if (!root) {
    const proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof location !== 'undefined' ? location.host : '127.0.0.1:5173';
    return `${proto}//${host}${path}`;
  }
  const u = new URL(root);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = path;
  u.search = '';
  u.hash = '';
  return u.toString();
}

export interface ChatSocketHandlers {
  /** Evento JSON da sala (`message`, `typing`, `accepted`, `closed`…), sem `pong`. */
  onMessage?: (data: Record<string, unknown>) => void;
  /** Conexão aberta; `reconnected` = já tinha aberto antes (buscar por REST o que faltou). */
  onOpen?: (info: { reconnected: boolean }) => void;
  onClose?: (ev: { code: number; final: boolean }) => void;
}

/**
 * Conexão com a sala de UM chat. Escrever na sala é restrito pelo backend (cliente dono; agente que pegou); ler,
 * todo interno pode. O socket é transporte: ao reconectar quem usa busca o que faltou por REST (`?after=<id>`).
 */
export class ChatSocket {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private opened = false;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly chatId: string | number,
    private readonly handlers: ChatSocketHandlers = {},
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.clearPing();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Envia um quadro JSON. `false` se a conexão não está aberta (nada foi enviado). */
  send(payload: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  private connect(): void {
    if (this.stopped) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(chatWsUrl(this.chatId));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      const reconnected = this.opened;
      this.opened = true;
      this.attempt = 0;
      this.startPing();
      this.handlers.onOpen?.({ reconnected });
    };
    ws.onmessage = (ev) => {
      let data: unknown;
      try {
        data = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!data || typeof data !== 'object' || !('type' in data)) return;
      if ((data as { type: unknown }).type === 'pong') return;
      this.handlers.onMessage?.(data as Record<string, unknown>);
    };
    ws.onerror = () => {
      /* o onclose que vem em seguida cuida da reconexão */
    };
    ws.onclose = (ev) => {
      if (this.ws === ws) {
        this.clearPing();
        this.ws = null;
      }
      const code = ev?.code ?? 0;
      const final = code === CLOSE_UNAUTHENTICATED || code === CLOSE_FORBIDDEN || code === CHAT_CLOSE_NOT_FOUND;
      this.handlers.onClose?.({ code, final });
      if (final) {
        this.stopped = true;
        return;
      }
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private startPing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
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
