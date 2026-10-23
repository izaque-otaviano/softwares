import type { AccessEvent, AccessHistory, AccountSession, DataSubjectRequest, PasswordChange, TwoFactorMethod, TwoFactorSetup, TwoFactorStatus } from '@/types/admin-b';
import { ApiError } from '../errors';
import { simulate } from './delay';

/** Código aceito no modo demonstração (qualquer outro vira "Código inválido"). */
const MOCK_2FA_CODE = '123456';

const t = (h: number) => new Date(Date.parse('2026-10-23T09:00:00-03:00') - h * 3_600_000).toISOString();
const week = 14 * 86_400_000;

let status: TwoFactorStatus = { method: '', pending: '', effective: '', required: false };
let setupMethod: TwoFactorMethod = '';
let sessions: AccountSession[] = [
  { key: 'mock-atual', browser: 'Chrome · Linux', userAgent: 'Chrome Linux', ip: '203.0.113.10', startedAt: t(1), expiresAt: new Date(Date.parse(t(1)) + week).toISOString(), current: true },
  { key: 'mock-2', browser: 'Firefox · Windows', userAgent: 'Firefox Windows', ip: '203.0.113.22', startedAt: t(30), expiresAt: new Date(Date.parse(t(30)) + week).toISOString(), current: false },
];
const event = (h: number, kind: string, label: string, browser: string, success = true): AccessEvent => ({ kind, label, ip: '203.0.113.10', browser, createdAt: t(h), success });
let events: AccessEvent[] = [
  event(1, 'login', 'Login', 'Chrome · Linux'),
  event(5, 'login_failed', 'Login falhou', 'Chrome · Linux', false),
  event(30, 'login', 'Login', 'Firefox · Windows'),
  event(200, 'password_changed', 'Senha alterada', 'Chrome · Linux'),
];

export function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return simulate(() => ({ ...status }));
}

export function setupTwoFactor(method: 'email' | 'totp'): Promise<TwoFactorSetup> {
  return simulate(() => {
    setupMethod = method;
    status = { ...status, pending: method };
    return method === 'totp' ? { method, secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Helpdesk:voce@exemplo.test?secret=JBSWY3DPEHPK3PXP&issuer=Helpdesk' } : { method, sent: true };
  });
}

export function confirmTwoFactor(code: string): Promise<{ method: TwoFactorMethod }> {
  return simulate(() => {
    if (!setupMethod) throw new ApiError('Nenhuma ativação em andamento. Comece de novo.', { status: 400 });
    if (code.trim() !== MOCK_2FA_CODE) throw new ApiError('Código inválido ou expirado.', { status: 400 });
    status = { ...status, method: setupMethod, effective: setupMethod, pending: '' };
    setupMethod = '';
    return { method: status.method };
  });
}

export function requestDisableCode(): Promise<{ sent: boolean }> {
  return simulate(() => {
    if (status.method !== 'email') throw new ApiError('Seu método atual não usa código por e-mail.', { status: 400 });
    return { sent: true };
  });
}

export function disableTwoFactor(code: string): Promise<{ method: TwoFactorMethod }> {
  return simulate(() => {
    if (!status.method) throw new ApiError('A verificação em duas etapas já está desativada.', { status: 400 });
    if (code.trim() !== MOCK_2FA_CODE) throw new ApiError('Código inválido ou expirado.', { status: 400 });
    status = { ...status, method: '', effective: '' };
    return { method: '' };
  });
}

export function listMySessions(): Promise<AccountSession[]> {
  return simulate(() => sessions.map((s) => ({ ...s })));
}

export function revokeMySession(key: string): Promise<void> {
  return simulate(() => {
    const s = sessions.find((x) => x.key === key);
    if (!s) throw new ApiError('Não encontrado.', { status: 404 });
    if (s.current) throw new ApiError('Esta é a sessão atual: use Sair.', { status: 400 });
    sessions = sessions.filter((x) => x.key !== key);
  });
}

export function getMyAccessHistory(): Promise<AccessHistory> {
  return simulate(() => ({ events: [...events], logins: events.filter((e) => e.kind.startsWith('login')), sessions: sessions.map((s) => ({ ...s })), sessionLimit: 3 }));
}

export function changeMyPassword(input: PasswordChange): Promise<void> {
  return simulate(() => {
    if (input.currentPassword !== 'senha-atual') throw new ApiError('Dados inválidos. Revise e tente novamente.', { status: 400, fieldErrors: { current_password: ['Senha atual incorreta.'] } });
    if (input.newPassword.length < 8) throw new ApiError('Dados inválidos. Revise e tente novamente.', { status: 400, fieldErrors: { new_password: ['Esta senha é muito curta. Ela precisa conter pelo menos 8 caracteres.'] } });
    events = [event(0, 'password_changed', 'Senha alterada', 'Chrome · Linux'), ...events];
  });
}

let myRequests: DataSubjectRequest[] = [];

export function listMyDataRequests(): Promise<DataSubjectRequest[]> {
  return simulate(() => [...myRequests]);
}

/** Exportação dos próprios dados (self-service); só existe o tipo exportação. */
export function requestMyExport(): Promise<DataSubjectRequest> {
  return simulate(() => {
    const open = myRequests.find((r) => ['pending', 'approved', 'running'].includes(r.status));
    if (open) return open;
    const r: DataSubjectRequest = { id: String(900 + myRequests.length), kind: 'export', status: 'running', verificationNote: '', isOverdue: false, daysLeft: 15, hasExport: false, result: {}, error: '', notes: '', rejectionReason: '', createdAt: new Date().toISOString() };
    myRequests = [r, ...myRequests];
    return r;
  });
}

/** Administrador sobre outro usuário. */
const others = new Map<string, AccessHistory>();
const historyOf = (userId: string): AccessHistory => {
  if (!others.has(userId)) {
    others.set(userId, {
      events: [event(3, 'login', 'Login', 'Safari · macOS')],
      logins: [event(3, 'login', 'Login', 'Safari · macOS')],
      sessions: [{ key: `mock-u${userId}-1`, browser: 'Safari · macOS', userAgent: 'Safari macOS', ip: '198.51.100.7', startedAt: t(3), expiresAt: new Date(Date.parse(t(3)) + week).toISOString(), current: false }],
      sessionLimit: 3,
    });
  }
  return others.get(userId)!;
};

export function getUserAccessHistory(userId: string): Promise<AccessHistory> {
  return simulate(() => structuredClone(historyOf(userId)));
}

export function revokeUserSession(userId: string, key: string): Promise<void> {
  return simulate(() => {
    const h = historyOf(userId);
    if (!h.sessions.some((s) => s.key === key)) throw new ApiError('Não encontrado.', { status: 404 });
    h.sessions = h.sessions.filter((s) => s.key !== key);
  });
}

export function revokeAllUserSessions(userId: string): Promise<void> {
  return simulate(() => {
    historyOf(userId).sessions = [];
  });
}
