import type { DataSubjectRequest, NewDataSubjectRequest, PageOf, PageQuery, RedactionCandidate } from '@/types/admin-b';
import { ApiError } from '../errors';
import { apiBaseUrl, http, toApiError } from './http';
import { mapDsr, mapPage, mapRedactionCandidate, type DataSubjectRequestDto, type PaginatedDto, type RedactionCandidateDto } from './mappers/adminB';

/**
 * LGPD (`/audit/lgpd/`, só administrador). Criar um pedido NÃO executa nada. `verify` registra como a identidade foi
 * conferida (obrigatório para anonimizar). `execute` e `redact` são IRREVERSÍVEIS: a tela só os chama depois de uma
 * confirmação forte. `redaction_candidates` só sugere (nunca apaga). O pacote (`download`) é um zip.
 */
const path = (id: string, tail = '') => `/audit/lgpd/${encodeURIComponent(id)}/${tail}`;

export async function listRequests(f: PageQuery = {}): Promise<PageOf<DataSubjectRequest>> {
  const q = { limit: f.limit ?? 25, offset: f.offset ?? 0 };
  return mapPage(await http.get<PaginatedDto<DataSubjectRequestDto>>('/audit/lgpd/', q), mapDsr, q);
}

export async function getRequest(id: string): Promise<DataSubjectRequest> {
  return mapDsr(await http.get<DataSubjectRequestDto>(path(id)));
}

export async function createRequest(input: NewDataSubjectRequest): Promise<DataSubjectRequest> {
  const body = { kind: input.kind, subject_user: input.subjectUserId ? Number(input.subjectUserId) : undefined, subject_company: input.subjectCompanyId ? Number(input.subjectCompanyId) : undefined, notes: input.notes ?? '' };
  return mapDsr(await http.post<DataSubjectRequestDto>('/audit/lgpd/', body));
}

export async function listRedactionCandidates(id: string): Promise<RedactionCandidate[]> {
  const dto = await http.get<{ candidates: RedactionCandidateDto[] }>(path(id, 'redaction_candidates/'));
  return (dto.candidates ?? []).map(mapRedactionCandidate);
}

export async function verifyRequest(id: string, note: string): Promise<DataSubjectRequest> {
  return mapDsr(await http.post<DataSubjectRequestDto>(path(id, 'verify/'), { verification_note: note.trim() }));
}

export async function rejectRequest(id: string, reason: string): Promise<DataSubjectRequest> {
  return mapDsr(await http.post<DataSubjectRequestDto>(path(id, 'reject/'), { rejection_reason: reason.trim() }));
}

/** IRREVERSÍVEL (anonimização) ou geração do pacote (exportação): dispara a execução em segundo plano no servidor. */
export async function executeRequest(id: string): Promise<DataSubjectRequest> {
  return mapDsr(await http.post<DataSubjectRequestDto>(path(id, 'execute/'), {}));
}

/** IRREVERSÍVEL: redige o campo apontado por `redaction_candidates`. */
export async function redactField(id: string, target: { model: string; pk: string }): Promise<{ redacted: boolean }> {
  const dto = await http.post<{ redacted: boolean }>(path(id, 'redact/'), { model: target.model, pk: Number(target.pk) });
  return { redacted: Boolean(dto?.redacted) };
}

/** Baixa o pacote de portabilidade (zip). `http` só lê JSON/texto, então este é o único `fetch` direto. */
export async function downloadDossier(id: string): Promise<{ blob: Blob; filename: string }> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path(id, 'download/')}`, { credentials: 'include', headers: { Accept: 'application/zip' } });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua rede e tente novamente.', { status: 0, code: 'rede' });
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = JSON.parse(await res.text());
    } catch {
      body = undefined;
    }
    throw toApiError(res.status, body, res.headers);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `meus-dados-${id}.zip`;
  return { blob: await res.blob(), filename };
}
