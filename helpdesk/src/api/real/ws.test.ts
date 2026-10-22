import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeSocket, meWsUrl } from './ws';

describe('meWsUrl', () => {
  it('usa host atual e /ws/me/ quando VITE_API_URL está vazio', () => {
    vi.stubEnv('VITE_API_URL', '');
    const url = meWsUrl();
    expect(url).toMatch(/\/ws\/me\/$/);
    expect(url.startsWith('ws://') || url.startsWith('wss://')).toBe(true);
  });

  it('converte http(s) de VITE_API_URL para ws(s)', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    expect(meWsUrl()).toBe('wss://api.example.com/ws/me/');
    vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:8000');
    expect(meWsUrl()).toBe('ws://127.0.0.1:8000/ws/me/');
  });
});

describe('MeSocket', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('não conecta de verdade no construtor; start/stop são idempotentes', () => {
    const sock = new MeSocket();
    expect(sock.connected).toBe(false);
    // Em jsdom WebSocket pode existir; start tenta conectar — stop deve limpar sem lançar.
    sock.stop();
    expect(sock.connected).toBe(false);
  });
});

describe('MeSocket: reconexão e limpeza', () => {
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
  });

  it('queda anormal reconecta com backoff; parar cancela o timer e não reabre', () => {
    setup();
    const sock = new MeSocket();
    sock.start();
    expect(FakeWS.instances).toHaveLength(1);
    FakeWS.instances[0]!.open();
    FakeWS.instances[0]!.drop(1006);
    vi.advanceTimersByTime(999);
    expect(FakeWS.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWS.instances).toHaveLength(2);
    FakeWS.instances[1]!.drop(1006); // sem open: o atraso dobra
    vi.advanceTimersByTime(1_999);
    expect(FakeWS.instances).toHaveLength(2);
    sock.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeWS.instances).toHaveLength(2);
  });

  it('4401/4403 (sessão expirada/sem permissão) não reconectam', () => {
    setup();
    for (const code of [4401, 4403]) {
      FakeWS.instances = [];
      const sock = new MeSocket();
      sock.start();
      FakeWS.instances[0]!.open();
      FakeWS.instances[0]!.drop(code);
      vi.advanceTimersByTime(120_000);
      expect(FakeWS.instances).toHaveLength(1);
      sock.stop();
    }
  });

  it('start duplicado não abre uma segunda conexão; o ping para ao fechar', () => {
    setup();
    const sock = new MeSocket();
    sock.start();
    sock.start();
    expect(FakeWS.instances).toHaveLength(1);
    const ws = FakeWS.instances[0]!;
    ws.open();
    vi.advanceTimersByTime(25_000);
    expect(ws.sent).toEqual([JSON.stringify({ type: 'ping' })]);
    sock.stop();
    vi.advanceTimersByTime(100_000);
    expect(ws.sent).toHaveLength(1);
  });
});
