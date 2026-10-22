import { describe, expect, it } from 'vitest';
import { shortDuration, slaDisplay } from './time';

const now = new Date('2026-03-10T12:00:00-03:00');
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

describe('shortDuration', () => {
  it('formata minutos, horas e dias', () => {
    expect(shortDuration(49)).toBe('49m');
    expect(shortDuration(80)).toBe('1h 20m');
    expect(shortDuration(120)).toBe('2h');
    expect(shortDuration(60 * 28)).toBe('1d 4h');
  });
});

describe('slaDisplay', () => {
  it('verde com folga', () => expect(slaDisplay(at(180), 'ok', now)).toEqual({ state: 'ok', label: '3h' }));
  it('âmbar perto do vencimento', () => expect(slaDisplay(at(49), 'ok', now)).toEqual({ state: 'warning', label: '49m' }));
  it('vermelho depois de vencer', () => expect(slaDisplay(at(-12), 'ok', now)).toEqual({ state: 'breached', label: 'Estourado há 12m' }));
  it('menos de 1 min depois do vencimento não vira "Estourado há 0m"', () => {
    expect(slaDisplay(new Date(now.getTime() - 30_000), 'ok', now)).toEqual({ state: 'breached', label: 'Estourado agora' });
    expect(slaDisplay(new Date(now.getTime() - 1), 'ok', now)).toEqual({ state: 'breached', label: 'Estourado agora' });
    expect(slaDisplay(at(-1), 'ok', now)).toEqual({ state: 'breached', label: 'Estourado há 1m' });
  });
  it('faltando menos de 1 min (ainda no prazo) mostra "<1m", não "0m"', () => {
    expect(slaDisplay(new Date(now.getTime() + 30_000), 'ok', now)).toEqual({ state: 'warning', label: '<1m' });
    expect(slaDisplay(at(1), 'ok', now)).toEqual({ state: 'warning', label: '1m' });
  });
  it('respeita SLA cumprido', () => expect(slaDisplay(at(-90), 'met', now).state).toBe('met'));
});
