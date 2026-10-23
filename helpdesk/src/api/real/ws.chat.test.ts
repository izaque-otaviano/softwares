import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatSocket, MeSocket, chatWsUrl, type MeChatEvent } from './ws';

class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  push(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}
const setup = () => {
  vi.useFakeTimers();
  FakeWS.instances = [];
  vi.stubGlobal('WebSocket', FakeWS);
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('chatWsUrl', () => {
  it('relativo ao host atual ou absoluto com VITE_API_URL', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(chatWsUrl(12)).toMatch(/^wss?:\/\/.+\/ws\/chat\/12\/$/);
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    expect(chatWsUrl('7')).toBe('wss://api.example.com/ws/chat/7/');
  });
});

describe('ChatSocket', () => {
  it('entrega eventos, ignora pong e envia quadros só com a conexão aberta', () => {
    setup();
    const got: unknown[] = [];
    const sock = new ChatSocket(5, { onMessage: (d) => got.push(d) });
    expect(sock.send({ type: 'message' })).toBe(false);
    sock.start();
    const ws = FakeWS.instances[0]!;
    expect(ws.url).toMatch(/\/ws\/chat\/5\/$/);
    expect(sock.send({ type: 'message' })).toBe(false); // ainda conectando
    ws.open();
    expect(sock.send({ type: 'typing', is_typing: true })).toBe(true);
    expect(ws.sent).toEqual([JSON.stringify({ type: 'typing', is_typing: true })]);
    ws.push({ type: 'pong' });
    ws.push({ type: 'message', id: 1 });
    ws.onmessage?.({ data: 'não é json' });
    expect(got).toEqual([{ type: 'message', id: 1 }]);
    sock.stop();
  });

  it('reconecta com backoff, avisa reconexão e para de vez em 4403/4404', () => {
    setup();
    const opens: boolean[] = [];
    const closes: boolean[] = [];
    const sock = new ChatSocket(5, { onOpen: (i) => opens.push(i.reconnected), onClose: (c) => closes.push(c.final) });
    sock.start();
    FakeWS.instances[0]!.open();
    FakeWS.instances[0]!.drop(1006);
    vi.advanceTimersByTime(1000);
    expect(FakeWS.instances).toHaveLength(2);
    FakeWS.instances[1]!.open();
    expect(opens).toEqual([false, true]);
    FakeWS.instances[1]!.drop(4404);
    vi.advanceTimersByTime(120_000);
    expect(FakeWS.instances).toHaveLength(2);
    expect(closes).toEqual([false, true]);
  });

  it('stop cancela ping e reconexão e não deixa handler vivo', () => {
    setup();
    const sock = new ChatSocket(5);
    sock.start();
    const ws = FakeWS.instances[0]!;
    ws.open();
    vi.advanceTimersByTime(25_000);
    expect(ws.sent).toHaveLength(1);
    sock.stop();
    vi.advanceTimersByTime(200_000);
    expect(ws.sent).toHaveLength(1);
    expect(ws.onmessage).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('MeSocket: eventos de chat', () => {
  it('chat_queued, chat_taken e notificações chat_* vão para os ouvintes; ticket_event continua igual', () => {
    setup();
    const sock = new MeSocket();
    const events: MeChatEvent[] = [];
    const ticket = vi.fn();
    const notified = vi.fn();
    const off = sock.addChatListener((e) => events.push(e));
    sock.setHandlers({ onTicketEvent: ticket, onNotification: notified });
    const opens = vi.fn();
    sock.addOpenListener(opens);
    sock.start();
    const ws = FakeWS.instances[0]!;
    ws.open();
    ws.push({ type: 'chat_queued', chat_id: 4, client_name: 'Ana', company: 'Acme' });
    ws.push({ type: 'chat_taken', chat_id: 4, agent_id: 1 });
    ws.push({ type: 'notification', kind: 'chat_message', chat_id: 4, preview: 'oi', author_name: 'Ana' });
    ws.push({ type: 'notification', kind: 'ticket_assigned', ticket_id: 9 });
    ws.push({ type: 'ticket_event', ticket_id: 9, kind: 'reply' });
    ws.push({ type: 'chat_queued' }); // sem chat_id: ignorado
    expect(events.map((e) => e.type)).toEqual(['chat_queued', 'chat_taken', 'chat_notification']);
    expect(events[2]).toMatchObject({ kind: 'chat_message', chat_id: 4, preview: 'oi' });
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(notified).toHaveBeenCalledTimes(2); // comportamento de ticket preservado
    expect(opens).toHaveBeenCalledTimes(1);
    off();
    ws.push({ type: 'chat_taken', chat_id: 5 });
    expect(events).toHaveLength(3);
    sock.stop();
  });
});
