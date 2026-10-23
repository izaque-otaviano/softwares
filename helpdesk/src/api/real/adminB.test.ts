import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import auditLogs from './__fixtures__/audit-logs.json';
import ticketAccess from './__fixtures__/audit-ticket-access.json';
import lgpdDetail from './__fixtures__/lgpd-detail.json';
import lgpdList from './__fixtures__/lgpd-list.json';
import accessHistory from './__fixtures__/me-access-history.json';
import sessionsFx from './__fixtures__/me-sessions.json';
import notificationsFx from './__fixtures__/notifications.json';
import prefsFx from './__fixtures__/notification-preferences.json';
import retentionFx from './__fixtures__/retention-list.json';
import twofaFx from './__fixtures__/twofa-status.json';
import { ApiError } from '../errors';
import * as audit from './audit';
import * as lgpd from './lgpd';
import * as notifications from './notifications';
import * as retention from './retention';
import * as security from './security';

/** Backend simulado por `fetch`: cada teste registra as respostas por rota e confere método, caminho e corpo enviados. */
const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

let fetchMock: ReturnType<typeof vi.fn>;
const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), method: (init as RequestInit).method ?? 'GET', body: (init as RequestInit).body ? JSON.parse(String((init as RequestInit).body)) : undefined }));
const last = () => calls().at(-1)!;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('auditoria (real)', () => {
  it('lista registros com filtros e paginação do servidor', async () => {
    fetchMock.mockImplementation(async () => json(auditLogs));
    const page = await audit.listAuditLogs({ limit: 25, offset: 50, action: 'export', actor: '1', from: '2026-10-01' });
    expect(last().url).toBe('/api/v1/audit/logs/?limit=25&offset=50&action=export&actor=1&from=2026-10-01');
    expect(page).toMatchObject({ total: auditLogs.count, limit: 25, offset: 50 });
    expect(page.items[0]!.actorName).toBe('Alice Admin');
  });

  it('acessos: ticket, usuário e somente negados (denied=1)', async () => {
    fetchMock.mockImplementation(async () => json(ticketAccess));
    await audit.listTicketAccess({ ticket: '8', user: '1', deniedOnly: true });
    expect(last().url).toBe('/api/v1/audit/ticket-access/?limit=25&offset=0&ticket=8&user=1&denied=1');
    await audit.listTicketAccess({});
    expect(last().url).not.toContain('denied');
  });

  it('detalhe, 404 e 403 (frase de permissão)', async () => {
    fetchMock.mockResolvedValueOnce(json(auditLogs.results[0]));
    const first = String(auditLogs.results[0]!.id);
    expect((await audit.getAuditLog(first)).id).toBe(first);
    expect(last().url).toBe(`/api/v1/audit/logs/${first}/`);
    fetchMock.mockResolvedValueOnce(json({ detail: 'Não encontrado.' }, 404));
    await expect(audit.getTicketAccess('999')).rejects.toMatchObject({ status: 404 });
    fetchMock.mockResolvedValueOnce(json({ detail: 'Apenas administradores.' }, 403));
    await expect(audit.listAuditLogs()).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Você não tem permissão para esta ação.') });
  });
});

describe('retenção (real)', () => {
  it('simular é POST em /simulate/ e devolve dry-run sem nada aplicado', async () => {
    fetchMock.mockImplementation(async () => json(retentionFx.results[0], 201));
    const run = await retention.simulateRetention();
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/audit/retention/simulate/' });
    expect(run.dryRun).toBe(true);
    expect(run.totalApplied).toBe(0);
  });

  it('revisão envia a nota; 400 quando não é simulação', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...retentionFx.results[0], is_reviewed: true, reviewed_by_name: 'Alice Admin', review_note: 'ok' }));
    const run = await retention.reviewRetentionRun('1', 'ok');
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/audit/retention/1/review/', body: { review_note: 'ok' } });
    expect(run.isReviewed).toBe(true);
    fetchMock.mockResolvedValueOnce(json({ detail: 'Só simulações precisam (e podem) ser revisadas.' }, 400));
    await expect(retention.reviewRetentionRun('2', '')).rejects.toMatchObject({ status: 400, message: 'Só simulações precisam (e podem) ser revisadas.' });
  });

  it('lista ciclos com limit/offset', async () => {
    fetchMock.mockImplementation(async () => json(retentionFx));
    const page = await retention.listRetentionRuns({ limit: 10, offset: 0 });
    expect(last().url).toBe('/api/v1/audit/retention/?limit=10&offset=0');
    expect(page.items).toHaveLength(1);
  });
});

describe('LGPD (real): ações irreversíveis só com fetch simulado', () => {
  it('lista e detalhe', async () => {
    fetchMock.mockResolvedValueOnce(json(lgpdList));
    expect((await lgpd.listRequests()).items.map((r) => r.id)).toEqual(['2', '1']);
    fetchMock.mockResolvedValueOnce(json(lgpdDetail));
    expect((await lgpd.getRequest('1')).status).toBe('pending');
    expect(last().url).toBe('/api/v1/audit/lgpd/1/');
  });

  it('verify manda a nota; sem nota o backend devolve 400 por campo', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...lgpdDetail, status: 'approved', verification_note: 'Videochamada' }));
    expect((await lgpd.verifyRequest('1', ' Videochamada ')).status).toBe('approved');
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/audit/lgpd/1/verify/', body: { verification_note: 'Videochamada' } });
    fetchMock.mockResolvedValueOnce(json({ verification_note: 'Descreva como a identidade foi confirmada.' }, 400));
    await expect(lgpd.verifyRequest('1', '')).rejects.toMatchObject({ status: 400, fieldErrors: { verification_note: ['Descreva como a identidade foi confirmada.'] } });
  });

  it('reject exige motivo', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...lgpdDetail, status: 'rejected', rejection_reason: 'Titular não identificado' }));
    const r = await lgpd.rejectRequest('1', 'Titular não identificado');
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/audit/lgpd/1/reject/', body: { rejection_reason: 'Titular não identificado' } });
    expect(r.status).toBe('rejected');
    fetchMock.mockResolvedValueOnce(json({ rejection_reason: 'A negativa precisa de justificativa (LGPD).' }, 400));
    await expect(lgpd.rejectRequest('1', '')).rejects.toMatchObject({ status: 400 });
  });

  it('execute e redact: POST nas rotas certas, 400 e 403 chegam ao chamador', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...lgpdDetail, status: 'running' }));
    expect((await lgpd.executeRequest('1')).status).toBe('running');
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/audit/lgpd/1/execute/' });
    fetchMock.mockResolvedValueOnce(json({ detail: 'Anonimização exige verificação de identidade antes de executar.' }, 400));
    await expect(lgpd.executeRequest('1')).rejects.toMatchObject({ status: 400, message: 'Anonimização exige verificação de identidade antes de executar.' });
    fetchMock.mockResolvedValueOnce(json({ redacted: true }));
    expect(await lgpd.redactField('1', { model: 'message', pk: '88' })).toEqual({ redacted: true });
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/audit/lgpd/1/redact/', body: { model: 'message', pk: 88 } });
    fetchMock.mockResolvedValueOnce(json({ detail: 'Apenas administradores.' }, 403));
    await expect(lgpd.redactField('1', { model: 'ticket', pk: '1' })).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Você não tem permissão para esta ação.') });
  });

  it('candidatos de anonimização', async () => {
    fetchMock.mockImplementation(async () => json({ candidates: [{ model: 'ticket', pk: 31, field: 'subject', reference: 'TD-00031', pattern: 'CPF' }] }));
    expect(await lgpd.listRedactionCandidates('1')).toEqual([{ model: 'ticket', pk: '31', field: 'subject', reference: 'TD-00031', pattern: 'CPF' }]);
    expect(last().url).toBe('/api/v1/audit/lgpd/1/redaction_candidates/');
  });

  it('criar pedido envia ids numéricos', async () => {
    fetchMock.mockImplementation(async () => json(lgpdDetail, 201));
    await lgpd.createRequest({ kind: 'anonymize', subjectUserId: '12', notes: 'x' });
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/audit/lgpd/', body: { kind: 'anonymize', subject_user: 12, notes: 'x' } });
  });

  it('download do dossiê: zip e nome do cabeçalho; 404 sem pacote', async () => {
    fetchMock.mockResolvedValueOnce(new Response('zip', { status: 200, headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="meus-dados-2.zip"' } }));
    const { blob, filename } = await lgpd.downloadDossier('2');
    expect(filename).toBe('meus-dados-2.zip');
    expect(blob.size).toBe(3);
    expect(last().url).toBe('/api/v1/audit/lgpd/2/download/');
    fetchMock.mockResolvedValueOnce(json({ detail: 'Pacote não disponível.' }, 404));
    await expect(lgpd.downloadDossier('1')).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(lgpd.downloadDossier('1')).rejects.toMatchObject({ status: 0 });
  });
});

describe('notificações (real)', () => {
  it('preferências: GET e PUT só com in_app e email', async () => {
    fetchMock.mockResolvedValueOnce(json(prefsFx));
    const p = await notifications.getPreferences();
    expect(p.kinds).toHaveLength(16);
    fetchMock.mockResolvedValueOnce(json({ ...prefsFx, email: { ...prefsFx.email, mention: false } }));
    const saved = await notifications.savePreferences({ inApp: p.inApp, email: { ...p.email, mention: false } });
    expect(last()).toMatchObject({ method: 'PUT', url: '/api/v1/notification-preferences/' });
    expect(Object.keys(last().body).sort()).toEqual(['email', 'in_app']);
    expect(saved.email.mention).toBe(false);
    fetchMock.mockResolvedValueOnce(json({ in_app: "Tipos desconhecidos: ['x']" }, 400));
    await expect(notifications.savePreferences({ inApp: { x: true }, email: {} })).rejects.toMatchObject({ status: 400 });
  });

  it('lista com não lidas, marcar uma e todas', async () => {
    fetchMock.mockResolvedValueOnce(json(notificationsFx));
    const page = await notifications.listNotifications({ unreadOnly: true, limit: 10 });
    expect(last().url).toBe('/api/v1/notifications/?limit=10&offset=0&unread=1');
    expect(page.unreadCount).toBe(1);
    fetchMock.mockResolvedValueOnce(json({ marked_read: 1 }));
    expect(await notifications.markNotificationRead('467')).toEqual({ markedRead: 1 });
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/notifications/467/read/' });
    fetchMock.mockResolvedValueOnce(json({ marked_read: 3 }));
    expect(await notifications.markAllNotificationsRead()).toEqual({ markedRead: 3 });
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/notifications/read-all/' });
  });
});

describe('segurança (real): 2FA, sessões e senha só com fetch simulado', () => {
  it('status', async () => {
    fetchMock.mockImplementation(async () => json(twofaFx));
    expect(await security.getTwoFactorStatus()).toEqual({ method: '', pending: '', effective: '', required: false });
    expect(last().url).toBe('/api/v1/auth/2fa/status/');
  });

  it('ativação por aplicativo: setup devolve segredo; confirm com código', async () => {
    fetchMock.mockResolvedValueOnce(json({ method: 'totp', secret: 'ABC', otpauth_uri: 'otpauth://totp/x' }));
    expect(await security.setupTwoFactor('totp')).toEqual({ method: 'totp', secret: 'ABC', otpauthUri: 'otpauth://totp/x', sent: undefined });
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/auth/2fa/setup/', body: { method: 'totp' } });
    fetchMock.mockResolvedValueOnce(json({ method: 'totp' }));
    expect(await security.confirmTwoFactor(' 123456 ')).toEqual({ method: 'totp' });
    expect(last()).toMatchObject({ url: '/api/v1/auth/2fa/confirm/', body: { code: '123456' } });
    fetchMock.mockResolvedValueOnce(json({ detail: 'Código inválido ou expirado.' }, 400));
    await expect(security.confirmTwoFactor('000000')).rejects.toMatchObject({ status: 400, message: 'Código inválido ou expirado.' });
  });

  it('desativação: request-code por e-mail e disable com código', async () => {
    fetchMock.mockResolvedValueOnce(json({ sent: true }));
    expect(await security.requestDisableCode()).toEqual({ sent: true });
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/auth/2fa/request-code/' });
    fetchMock.mockResolvedValueOnce(json({ method: '' }));
    expect(await security.disableTwoFactor('654321')).toEqual({ method: '' });
    expect(last()).toMatchObject({ url: '/api/v1/auth/2fa/disable/', body: { code: '654321' } });
    fetchMock.mockResolvedValueOnce(json({ detail: 'A verificação em duas etapas já está desativada.' }, 400));
    await expect(security.disableTwoFactor('1')).rejects.toMatchObject({ status: 400 });
  });

  it('sessões: lista, encerrar uma (204), 404 e histórico', async () => {
    fetchMock.mockResolvedValueOnce(json(sessionsFx));
    expect((await security.listMySessions()).map((s) => s.current)).toEqual([true, false, false]);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await security.revokeMySession('fake-session-key-1');
    expect(last()).toMatchObject({ method: 'DELETE', url: '/api/v1/me/sessions/fake-session-key-1/' });
    fetchMock.mockResolvedValueOnce(json({ detail: 'Não encontrado.' }, 404));
    await expect(security.revokeMySession('nada')).rejects.toMatchObject({ status: 404 });
    fetchMock.mockResolvedValueOnce(json(accessHistory));
    expect((await security.getMyAccessHistory()).sessionLimit).toBe(3);
    expect(last().url).toBe('/api/v1/me/access-history/');
  });

  it('administrador sobre outro usuário: histórico, uma sessão e todas', async () => {
    fetchMock.mockResolvedValueOnce(json(accessHistory));
    await security.getUserAccessHistory('7');
    expect(last().url).toBe('/api/v1/settings/users/7/access-history/');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await security.revokeUserSession('7', 'k1');
    expect(last()).toMatchObject({ method: 'DELETE', url: '/api/v1/settings/users/7/sessions/k1/' });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await security.revokeAllUserSessions('7');
    expect(last()).toMatchObject({ method: 'DELETE', url: '/api/v1/settings/users/7/sessions/' });
    fetchMock.mockResolvedValueOnce(json({ detail: 'Apenas administradores.' }, 403));
    await expect(security.revokeAllUserSessions('7')).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Você não tem permissão para esta ação.') });
  });

  it('senha: corpo com current_password e new_password; 400 por campo', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'Senha trocada.' }));
    await security.changeMyPassword({ currentPassword: 'a', newPassword: 'b' });
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/me/password/', body: { current_password: 'a', new_password: 'b' } });
    fetchMock.mockResolvedValueOnce(json({ current_password: ['Senha atual incorreta.'] }, 400));
    await expect(security.changeMyPassword({ currentPassword: 'x', newPassword: 'y' })).rejects.toMatchObject({ fieldErrors: { current_password: ['Senha atual incorreta.'] } });
  });

  it('meus pedidos de dados', async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    expect(await security.listMyDataRequests()).toEqual([]);
    fetchMock.mockResolvedValueOnce(json({ ...lgpdDetail, kind: 'export' }, 201));
    await security.requestMyExport();
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/me/data-requests/', body: { kind: 'export' } });
  });
});
