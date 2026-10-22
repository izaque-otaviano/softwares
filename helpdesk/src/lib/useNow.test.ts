import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

const START = new Date('2026-03-10T12:00:00-03:00');

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it('começa na hora atual', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current.getTime()).toBe(START.getTime());
  });

  it('renova a cada intervalo (padrão 30 s)', () => {
    const { result } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(result.current.getTime()).toBe(START.getTime());
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.getTime()).toBe(START.getTime() + 30_000);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.getTime()).toBe(START.getTime() + 90_000);
  });

  it('respeita um intervalo customizado', () => {
    const { result } = renderHook(() => useNow(1_000));
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.getTime()).toBe(START.getTime() + 3_000);
  });

  it('limpa o intervalo ao desmontar', () => {
    const before = vi.getTimerCount();
    const { unmount } = renderHook(() => useNow());
    expect(vi.getTimerCount()).toBe(before + 1);
    unmount();
    expect(vi.getTimerCount()).toBe(before);
  });

  it('com intervalo 0 não cria timer e o valor fica fixo', () => {
    const before = vi.getTimerCount();
    const { result } = renderHook(() => useNow(0));
    expect(vi.getTimerCount()).toBe(before);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current.getTime()).toBe(START.getTime());
  });

  it('ao reativar o relógio depois de parado, renova o valor velho na hora', () => {
    const { result, rerender } = renderHook(({ ms }) => useNow(ms), { initialProps: { ms: 0 } });
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(result.current.getTime()).toBe(START.getTime());
    rerender({ ms: 30_000 });
    expect(result.current.getTime()).toBe(START.getTime() + 10 * 60_000);
  });

  it('renova quando a aba volta a ficar visível', () => {
    const { result } = renderHook(() => useNow(60_000));
    vi.setSystemTime(new Date(START.getTime() + 45_000));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.getTime()).toBe(START.getTime() + 45_000);
  });
});
