import { describe, expect, it } from 'vitest';
import { dayLabel, deliveryState, fillTemplate, formatBytes, queueLabel, waitLabel } from './chatUtils';

describe('chatUtils', () => {
  it('fillTemplate troca {{solicitante}} pelo primeiro nome e {{empresa}}', () => {
    const chat = { clientName: 'Carlos Menezes', companyName: 'Horizonte' };
    expect(fillTemplate('Oi, {{solicitante}}! Na {{ empresa }}?', chat)).toBe('Oi, Carlos! Na Horizonte?');
    expect(fillTemplate('{{nome_do_cliente}}', chat)).toBe('Carlos');
    expect(fillTemplate('x {{solicitante}}', null)).toBe('x {{solicitante}}');
  });
  it('queueLabel', () => {
    expect(queueLabel({ queue: null })).toBeNull();
    expect(queueLabel({ queue: { position: 1, ahead: 0, estimatedWaitMinutes: null, queueOpen: true, queueOpensAt: null } })).toBe('1º da fila');
    expect(queueLabel({ queue: { position: 3, ahead: 2, estimatedWaitMinutes: 9, queueOpen: true, queueOpensAt: null } })).toBe('3º da fila, espera de cerca de 9 min');
    expect(queueLabel({ queue: { position: 2, ahead: 1, estimatedWaitMinutes: null, queueOpen: false, queueOpensAt: 'x' } })).toBe('2º da fila, fila fechada');
  });
  it('waitLabel e dayLabel', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    expect(waitLabel('2026-10-23T11:54:00Z', now)).toBe('6m');
    expect(waitLabel('2026-10-23T11:59:50Z', now)).toBe('agora');
    expect(dayLabel('2026-10-23T09:00:00Z', now)).toBe('Hoje');
    expect(dayLabel('2026-10-22T09:00:00Z', now)).toBe('Ontem');
  });
  it('deliveryState e formatBytes', () => {
    expect(deliveryState({ state: 'sent', readAt: 'x', deliveredAt: 'y' })).toBe('read');
    expect(deliveryState({ state: 'sent', readAt: null, deliveredAt: 'y' })).toBe('delivered');
    expect(deliveryState({ state: 'sent', readAt: null, deliveredAt: null })).toBe('sent');
    expect(deliveryState({ state: 'failed', readAt: null, deliveredAt: null })).toBe('failed');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1536 * 1024)).toBe('1,5 MB');
  });
});
