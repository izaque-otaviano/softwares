import type { AccessHistory, AccountSession, DataSubjectRequest, PasswordChange, TwoFactorMethod, TwoFactorSetup, TwoFactorStatus } from '@/types/admin-b';
import { http } from './http';
import {
  mapAccessHistory,
  mapDsr,
  mapLiveSession,
  mapTwoFactorSetup,
  mapTwoFactorStatus,
  type AccessHistoryDto,
  type DataSubjectRequestDto,
  type LiveSessionDto,
  type TwoFactorSetupDto,
  type TwoFactorStatusDto,
} from './mappers/adminB';

/**
 * SEGURANÇA DA CONTA. 2FA do próprio usuário: `/auth/2fa/status|setup|confirm|request-code|disable/` (o estado da
 * ativação mora na sessão do servidor; nada muda na conta até confirmar um código; desativar exige o código do método
 * atual). `/auth/2fa/` e `/auth/2fa/resend/` são da SEGUNDA ETAPA DO LOGIN e ficam com a tela de entrada.
 * Sessões e histórico: `/me/sessions/`, `/me/sessions/{key}/`, `/me/access-history/`. Senha: `/me/password/`.
 * Visão do administrador sobre outro usuário: `/settings/users/{id}/access-history/` e `.../sessions/[{key}/]`.
 */
const uid = (id: string) => encodeURIComponent(id);

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return mapTwoFactorStatus(await http.get<TwoFactorStatusDto>('/auth/2fa/status/'));
}

export async function setupTwoFactor(method: 'email' | 'totp'): Promise<TwoFactorSetup> {
  return mapTwoFactorSetup(await http.post<TwoFactorSetupDto>('/auth/2fa/setup/', { method }));
}

export async function confirmTwoFactor(code: string): Promise<{ method: TwoFactorMethod }> {
  const dto = await http.post<{ method: TwoFactorMethod }>('/auth/2fa/confirm/', { code: code.trim() });
  return { method: dto.method };
}

export async function requestDisableCode(): Promise<{ sent: boolean }> {
  const dto = await http.post<{ sent: boolean }>('/auth/2fa/request-code/', {});
  return { sent: Boolean(dto?.sent) };
}

export async function disableTwoFactor(code: string): Promise<{ method: TwoFactorMethod }> {
  const dto = await http.post<{ method: TwoFactorMethod }>('/auth/2fa/disable/', { code: code.trim() });
  return { method: dto.method };
}

export async function listMySessions(): Promise<AccountSession[]> {
  return (await http.get<LiveSessionDto[]>('/me/sessions/')).map(mapLiveSession);
}

export async function revokeMySession(key: string): Promise<void> {
  await http.delete(`/me/sessions/${uid(key)}/`);
}

export async function getMyAccessHistory(): Promise<AccessHistory> {
  return mapAccessHistory(await http.get<AccessHistoryDto>('/me/access-history/'));
}

export async function changeMyPassword(input: PasswordChange): Promise<void> {
  await http.post('/me/password/', { current_password: input.currentPassword, new_password: input.newPassword });
}

export async function listMyDataRequests(): Promise<DataSubjectRequest[]> {
  return (await http.get<DataSubjectRequestDto[]>('/me/data-requests/')).map(mapDsr);
}

export async function requestMyExport(): Promise<DataSubjectRequest> {
  return mapDsr(await http.post<DataSubjectRequestDto>('/me/data-requests/', { kind: 'export' }));
}

export async function getUserAccessHistory(userId: string): Promise<AccessHistory> {
  return mapAccessHistory(await http.get<AccessHistoryDto>(`/settings/users/${uid(userId)}/access-history/`));
}

export async function revokeUserSession(userId: string, key: string): Promise<void> {
  await http.delete(`/settings/users/${uid(userId)}/sessions/${uid(key)}/`);
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await http.delete(`/settings/users/${uid(userId)}/sessions/`);
}
