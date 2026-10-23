import { describe, expect, it } from 'vitest';
import auditLogs from '../__fixtures__/audit-logs.json';
import ticketAccess from '../__fixtures__/audit-ticket-access.json';
import candidates from '../__fixtures__/lgpd-candidates.json';
import lgpdDetail from '../__fixtures__/lgpd-detail.json';
import lgpdList from '../__fixtures__/lgpd-list.json';
import accessHistory from '../__fixtures__/me-access-history.json';
import sessions from '../__fixtures__/me-sessions.json';
import notifications from '../__fixtures__/notifications.json';
import prefs from '../__fixtures__/notification-preferences.json';
import retention from '../__fixtures__/retention-list.json';
import twofa from '../__fixtures__/twofa-status.json';
import {
  browserOf,
  mapAccessHistory,
  mapAuditLog,
  mapDsr,
  mapLiveSession,
  mapNotification,
  mapPage,
  mapPrefs,
  mapRedactionCandidate,
  mapRetentionRun,
  mapTicketAccess,
  mapTwoFactorStatus,
  type AccessHistoryDto,
  type AuditLogDto,
  type DataSubjectRequestDto,
  type LiveSessionDto,
  type NotificationDto,
  type NotificationPrefsDto,
  type PaginatedDto,
  type RetentionRunDto,
  type TicketAccessDto,
  type TwoFactorStatusDto,
} from './adminB';

describe('mapeadores de auditoria', () => {
  it('registro de auditoria: ids em texto, ator e IP ausentes tratados', () => {
    const page = mapPage(auditLogs as unknown as PaginatedDto<AuditLogDto>, mapAuditLog, { limit: 25, offset: 0 });
    expect(page.total).toBe(auditLogs.count);
    expect(page.items[0]).toMatchObject({ id: expect.any(String), actorName: 'Alice Admin', action: expect.any(String), ip: undefined });
    expect(mapAuditLog({ ...(auditLogs.results[0] as unknown as AuditLogDto), actor: null, actor_name: '—', changes: null, ip_address: '10.0.0.1' })).toMatchObject({ actorName: 'Sistema', actorId: undefined, changes: {}, ip: '10.0.0.1' });
  });

  it('acesso a ticket: negado e usuário removido', () => {
    const first = mapTicketAccess(ticketAccess.results[0] as unknown as TicketAccessDto);
    expect(first).toMatchObject({ ticketReference: 'TD-00008', team: 'Financeiro', granted: true, context: 'detail', ip: '127.0.0.1' });
    expect(mapTicketAccess({ ...(ticketAccess.results[0] as unknown as TicketAccessDto), user: null, user_name: '—', was_granted: false })).toMatchObject({ userName: 'Usuário removido', granted: false });
  });
});

describe('mapeadores de retenção e LGPD', () => {
  it('ciclo de simulação: políticas viram lista e nada foi aplicado', () => {
    const run = mapRetentionRun(retention.results[0] as unknown as RetentionRunDto);
    expect(run.dryRun).toBe(true);
    expect(run.policies.map((p) => p.key).sort()).toEqual(['audit_log', 'chat_content', 'notification_read', 'outbound_email', 'report_export_file', 'ticket_access_log', 'ticket_content']);
    expect(run.totalApplied).toBe(0);
    expect(run.isReviewed).toBe(false);
    expect(run.reviewedByName).toBeUndefined();
  });

  it('política com erro mantém a mensagem', () => {
    const base = retention.results[0] as unknown as RetentionRunDto;
    const run = mapRetentionRun({ ...base, results: { ticket_content: { matched: 0, applied: 0, sample: [], error: 'falhou' } } });
    expect(run.policies[0]).toMatchObject({ key: 'ticket_content', error: 'falhou' });
  });

  it('pedido LGPD: pendente, com prazo e sem pacote', () => {
    const d = mapDsr(lgpdDetail as unknown as DataSubjectRequestDto);
    expect(d).toMatchObject({ id: '1', kind: 'anonymize', status: 'pending', subjectUserName: 'Cli Dois B', hasExport: false, isOverdue: false, daysLeft: 14 });
    expect(d.subjectCompanyId).toBeUndefined();
    expect(lgpdList.results).toHaveLength(2);
  });

  it('candidatos: só rótulo do padrão, nunca o trecho', () => {
    expect(candidates.candidates).toEqual([]);
    const c = mapRedactionCandidate({ model: 'message', pk: 88, field: 'body', reference: 'TD-1', pattern: 'CPF' });
    expect(c).toEqual({ model: 'message', pk: '88', field: 'body', reference: 'TD-1', pattern: 'CPF' });
  });
});

describe('mapeadores de notificações e segurança', () => {
  it('notificações: contador de não lidas e item', () => {
    const page = mapPage(notifications as unknown as PaginatedDto<NotificationDto>, mapNotification, { limit: 25, offset: 0 });
    expect(page.unreadCount).toBe(1);
    expect(page.items[0]).toMatchObject({ id: '467', kind: 'ticket_assigned', ticketId: '24', actorName: 'Sofia Supervisora', readAt: undefined });
  });

  it('preferências: 16 tipos, tudo ligado por padrão', () => {
    const p = mapPrefs(prefs as unknown as NotificationPrefsDto);
    expect(p.kinds).toHaveLength(16);
    expect(Object.values(p.inApp).every(Boolean)).toBe(true);
    expect(p.email.mention).toBe(true);
  });

  it('status do 2FA', () => {
    expect(mapTwoFactorStatus(twofa as unknown as TwoFactorStatusDto)).toEqual({ method: '', pending: '', effective: '', required: false });
    expect(mapTwoFactorStatus({ method: 'totp', pending: '', effective: 'totp', required: true }).method).toBe('totp');
    expect(mapTwoFactorStatus({ method: 'sms', pending: '', effective: '', required: false }).method).toBe('');
  });

  it('sessões e histórico', () => {
    const s = mapLiveSession(sessions[0] as unknown as LiveSessionDto);
    expect(s).toMatchObject({ current: true, browser: 'curl/8.5.0', ip: '127.0.0.1' });
    expect(mapLiveSession(sessions[2] as unknown as LiveSessionDto).browser).toBe('Chrome · Linux');
    const h = mapAccessHistory(accessHistory as unknown as AccessHistoryDto);
    expect(h.sessionLimit).toBe(3);
    expect(h.events[0]).toMatchObject({ label: 'Login', success: true });
    expect(h.sessions.some((x) => x.current)).toBe(true);
  });

  it('browserOf', () => {
    expect(browserOf('')).toBe('Desconhecido');
    expect(browserOf('Mozilla/5.0 (Windows NT 10.0) Gecko Firefox/120')).toBe('Firefox · Windows');
    expect(browserOf('Mozilla/5.0 (iPhone; CPU iPhone OS) Safari')).toBe('Safari · iOS');
    expect(browserOf('xyz')).toBe('xyz');
  });
});
