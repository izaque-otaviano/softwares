import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AA_NORMAL, contrastRatio } from './colorContrast';
import { SlaPill } from './SlaPill';
import { classColors } from './testTokens';

const NOW = new Date('2026-03-10T12:00:00-03:00');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const pill = () => screen.getByRole('img');

describe('SlaPill: formatos (relógio fixo)', () => {
  it('49m (âmbar)', () => {
    render(<SlaPill dueAt={at(49)} state="ok" now={NOW} />);
    expect(pill()).toHaveTextContent('49m');
    expect(pill()).toHaveAttribute('data-sla-state', 'warning');
    expect(pill()).toHaveClass('bg-sla-warn', 'text-sla-warnText');
  });

  it('1h 20m (verde)', () => {
    render(<SlaPill dueAt={at(80)} state="ok" now={NOW} />);
    expect(pill()).toHaveTextContent('1h 20m');
    expect(pill()).toHaveAttribute('data-sla-state', 'ok');
    expect(pill()).toHaveClass('bg-sla-bg', 'text-sla-text');
  });

  it('Estourado há 12m (vermelho)', () => {
    render(<SlaPill dueAt={at(-12)} state="breached" now={NOW} />);
    expect(pill()).toHaveTextContent('Estourado há 12m');
    expect(pill()).toHaveAttribute('data-sla-state', 'breached');
    expect(pill()).toHaveClass('bg-sla-breach', 'text-sla-breachText');
  });

  it('Cumprido (estado met, mesmo com prazo no passado)', () => {
    render(<SlaPill dueAt={at(-90)} state="met" now={NOW} />);
    expect(pill()).toHaveTextContent('Cumprido');
    expect(pill()).toHaveAttribute('data-sla-state', 'met');
    expect(pill()).toHaveClass('bg-sla-bg');
  });

  it('tem ícone de relógio decorativo', () => {
    const { container } = render(<SlaPill dueAt={at(80)} state="ok" now={NOW} />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('lucide-clock');
  });

  it.each([
    ['verde', 80, 'ok'],
    ['âmbar', 30, 'warning'],
    ['vermelho', -5, 'breached'],
  ] as const)('contraste AA no estado %s', (_name, minutes, state) => {
    render(<SlaPill dueAt={at(minutes)} state={state} now={NOW} />);
    const { bg, text } = classColors(pill());
    expect(contrastRatio(text!, bg!)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('SlaPill: aria-label', () => {
  it('primeira resposta restante', () => {
    render(<SlaPill dueAt={at(49)} state="ok" now={NOW} target="first_reply" />);
    expect(screen.getByRole('img', { name: 'SLA de primeira resposta: 49m restantes' })).toBeInTheDocument();
  });

  it('resolução restante com horas', () => {
    render(<SlaPill dueAt={at(80)} state="ok" now={NOW} target="resolution" />);
    expect(screen.getByRole('img', { name: 'SLA de resolução: 1h 20m restantes' })).toBeInTheDocument();
  });

  it('estourado', () => {
    render(<SlaPill dueAt={at(-12)} state="breached" now={NOW} target="first_reply" />);
    expect(screen.getByRole('img', { name: 'SLA de primeira resposta: estourado há 12m' })).toBeInTheDocument();
  });

  it('cumprido', () => {
    render(<SlaPill dueAt={at(-12)} state="met" now={NOW} target="resolution" />);
    expect(screen.getByRole('img', { name: 'SLA de resolução: cumprido' })).toBeInTheDocument();
  });

  it('sem target usa apenas "SLA"', () => {
    render(<SlaPill dueAt={at(49)} state="ok" now={NOW} />);
    expect(screen.getByRole('img', { name: 'SLA: 49m restantes' })).toBeInTheDocument();
  });
});

describe('SlaPill: compact e className', () => {
  it('compact reduz altura e fonte', () => {
    render(<SlaPill dueAt={at(80)} state="ok" now={NOW} compact className="ml-2" />);
    expect(pill()).toHaveClass('h-4', 'text-2xs', 'ml-2');
  });

  it('padrão tem 20px e 12px', () => {
    render(<SlaPill dueAt={at(80)} state="ok" now={NOW} />);
    expect(pill()).toHaveClass('h-5', 'text-xs');
  });
});

describe('SlaPill: ao vivo (useNow, tempo simulado)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const advance = (minutes: number) =>
    act(() => {
      vi.advanceTimersByTime(minutes * 60_000);
    });

  it('transita verde -> âmbar -> vermelho conforme o tempo passa', () => {
    render(<SlaPill dueAt={at(125)} state="ok" />);
    expect(pill()).toHaveTextContent('2h 5m');
    expect(pill()).toHaveAttribute('data-sla-state', 'ok');

    advance(65); // restam 60 min: entra na faixa âmbar
    expect(pill()).toHaveTextContent('1h');
    expect(pill()).toHaveAttribute('data-sla-state', 'warning');

    advance(11); // restam 49 min
    expect(pill()).toHaveTextContent('49m');
    expect(pill()).toHaveClass('bg-sla-warn');

    advance(61); // venceu há 12 min
    expect(pill()).toHaveTextContent('Estourado há 12m');
    expect(pill()).toHaveAttribute('data-sla-state', 'breached');
    expect(pill()).toHaveClass('bg-sla-breach');
  });

  it('atualiza a cada 30 s, não antes', () => {
    // 100 min e 20 s: mostra 1h 40m; no primeiro tick (30 s) restam 99m50s e vira 1h 39m.
    const dueAt = new Date(NOW.getTime() + 100 * 60_000 + 20_000).toISOString();
    render(<SlaPill dueAt={dueAt} state="ok" />);
    expect(pill()).toHaveTextContent('1h 40m');
    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(pill()).toHaveTextContent('1h 40m');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(pill()).toHaveTextContent('1h 39m');
  });

  it('live={false} não cria timer nem muda', () => {
    const before = vi.getTimerCount();
    render(<SlaPill dueAt={at(80)} state="ok" live={false} />);
    expect(vi.getTimerCount()).toBe(before);
    advance(30);
    expect(pill()).toHaveTextContent('1h 20m');
  });

  it('relógio fixo (now) não cria timer', () => {
    const before = vi.getTimerCount();
    render(<SlaPill dueAt={at(80)} state="ok" now={NOW} />);
    expect(vi.getTimerCount()).toBe(before);
  });

  it('SLA cumprido não precisa de timer', () => {
    const before = vi.getTimerCount();
    render(<SlaPill dueAt={at(-5)} state="met" />);
    expect(pill()).toHaveTextContent('Cumprido');
    expect(vi.getTimerCount()).toBe(before);
  });

  it('limpa o intervalo ao desmontar', () => {
    const before = vi.getTimerCount();
    const { unmount } = render(<SlaPill dueAt={at(80)} state="ok" />);
    expect(vi.getTimerCount()).toBe(before + 1);
    unmount();
    expect(vi.getTimerCount()).toBe(before);
  });
});
