import type { DataSubjectRequest, NewDataSubjectRequest, PageOf, PageQuery, RedactionCandidate } from '@/types/admin-b';
import { ApiError } from '../errors';
import { simulate } from './delay';

const day = 86_400_000;
const at = (offsetDays: number) => new Date(Date.parse('2026-10-23T09:00:00-03:00') + offsetDays * day).toISOString();

const base = (over: Partial<DataSubjectRequest> & Pick<DataSubjectRequest, 'id' | 'kind' | 'status'>): DataSubjectRequest => ({
  verificationNote: '',
  isOverdue: false,
  hasExport: false,
  result: {},
  error: '',
  notes: '',
  rejectionReason: '',
  createdAt: at(-1),
  ...over,
});

let requests: DataSubjectRequest[] = [
  base({ id: '4', kind: 'anonymize', status: 'pending', subjectUserName: 'Cliente Exemplo Um', subjectUserId: '501', dueAt: at(14), daysLeft: 14, notes: 'Pedido recebido por e-mail do titular.', createdAt: at(-1) }),
  base({ id: '3', kind: 'anonymize', status: 'approved', subjectUserName: 'Cliente Exemplo Dois', subjectUserId: '502', verifiedAt: at(-3), verificationNote: 'Confirmado por videochamada com documento.', dueAt: at(5), daysLeft: 5, createdAt: at(-10) }),
  base({ id: '2', kind: 'export', status: 'done', subjectUserName: 'Cliente Exemplo Três', subjectUserId: '503', hasExport: true, executedAt: at(-6), executedByName: 'Alice Admin', createdAt: at(-8) }),
  base({ id: '1', kind: 'anonymize', status: 'pending', subjectCompanyName: 'Empresa Exemplo', subjectCompanyId: '9', isOverdue: true, dueAt: at(-2), daysLeft: -2, createdAt: at(-17) }),
];
let seq = 5;

const find = (id: string) => {
  const r = requests.find((x) => x.id === id);
  if (!r) throw new ApiError('Não encontrado.', { status: 404 });
  return r;
};
const put = (next: DataSubjectRequest) => {
  requests = requests.map((r) => (r.id === next.id ? next : r));
  return next;
};

export function listRequests(f: PageQuery = {}): Promise<PageOf<DataSubjectRequest>> {
  return simulate(() => {
    const limit = f.limit ?? 25;
    const offset = f.offset ?? 0;
    return { items: requests.slice(offset, offset + limit), total: requests.length, limit, offset };
  });
}

export function getRequest(id: string): Promise<DataSubjectRequest> {
  return simulate(() => find(id));
}

export function createRequest(input: NewDataSubjectRequest): Promise<DataSubjectRequest> {
  return simulate(() => {
    if (!input.subjectUserId && !input.subjectCompanyId) throw new ApiError('Informe o usuário ou a empresa alvo do pedido.', { status: 400 });
    const r = base({
      id: String(seq++),
      kind: input.kind,
      status: 'pending',
      subjectUserId: input.subjectUserId,
      subjectUserName: input.subjectUserId ? `Titular ${input.subjectUserId}` : undefined,
      subjectCompanyId: input.subjectCompanyId,
      subjectCompanyName: input.subjectCompanyId ? `Empresa ${input.subjectCompanyId}` : undefined,
      notes: input.notes ?? '',
      dueAt: at(15),
      daysLeft: 15,
      createdAt: at(0),
    });
    requests = [r, ...requests];
    return r;
  });
}

export function listRedactionCandidates(id: string): Promise<RedactionCandidate[]> {
  return simulate(() => {
    find(id);
    return [
      { model: 'ticket', pk: '31', field: 'subject', reference: 'TD-00031', pattern: 'CPF' },
      { model: 'message', pk: '88', field: 'body', reference: 'TD-00031', pattern: 'Telefone' },
    ];
  });
}

export function verifyRequest(id: string, note: string): Promise<DataSubjectRequest> {
  return simulate(() => {
    const r = find(id);
    if (!note.trim()) throw new ApiError('Descreva como a identidade foi confirmada.', { status: 400, fieldErrors: { verification_note: ['Descreva como a identidade foi confirmada.'] } });
    if (r.status !== 'pending') throw new ApiError('Pedido já processado.', { status: 400 });
    return put({ ...r, status: 'approved', verificationNote: note.trim(), verifiedAt: new Date().toISOString() });
  });
}

export function rejectRequest(id: string, reason: string): Promise<DataSubjectRequest> {
  return simulate(() => {
    const r = find(id);
    if (!reason.trim()) throw new ApiError('A negativa precisa de justificativa (LGPD).', { status: 400, fieldErrors: { rejection_reason: ['A negativa precisa de justificativa (LGPD).'] } });
    if (!['pending', 'approved', 'running'].includes(r.status)) throw new ApiError('Pedido já encerrado.', { status: 400 });
    return put({ ...r, status: 'rejected', rejectionReason: reason.trim(), executedAt: new Date().toISOString(), executedByName: 'Você' });
  });
}

export function executeRequest(id: string): Promise<DataSubjectRequest> {
  return simulate(() => {
    const r = find(id);
    const allowed = r.kind === 'anonymize' ? ['approved', 'failed'] : ['pending', 'approved', 'failed'];
    if (!allowed.includes(r.status)) {
      throw new ApiError(r.kind === 'anonymize' ? 'Anonimização exige verificação de identidade antes de executar.' : 'Pedido já processado.', { status: 400 });
    }
    return put({ ...r, status: 'done', executedAt: new Date().toISOString(), executedByName: 'Você', hasExport: r.kind === 'export', result: { simulado: true } });
  });
}

export function redactField(id: string, target: { model: string; pk: string }): Promise<{ redacted: boolean }> {
  return simulate(() => {
    find(id);
    if (!['ticket', 'message'].includes(target.model) || !target.pk) throw new ApiError("Informe model ('ticket'|'message') e pk.", { status: 400 });
    return { redacted: true };
  });
}

export function downloadDossier(id: string): Promise<{ blob: Blob; filename: string }> {
  return simulate(() => {
    const r = find(id);
    if (!r.hasExport) throw new ApiError('Pacote não disponível.', { status: 404 });
    return { blob: new Blob([`Pacote de exemplo do pedido ${id} (modo demonstração).`], { type: 'text/plain' }), filename: `meus-dados-${id}.txt` };
  });
}
