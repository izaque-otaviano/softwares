import { ME_ID } from './data';
import { countViews, runView as runViewPure, type ViewContext } from '@/lib/views';
import { TYPE_LABEL } from '@/lib/status';
import { EMAIL_RE, MAX_CC, ticketCcList } from '@/lib/ticketContacts';
import { cleanValues, fieldKey, formatFieldValue, formForTicket, isFilled, missingRequired, requiredError, slotsFor } from '@/lib/customFields';
import type { AiSummary, AuditEvent, Comment, FieldValue, Priority, Ticket, TicketContact, View } from '@/types/domain';
import { ApiError } from '../errors';
import { simulate } from './delay';
import { db } from './db';

export function viewContext(now: Date = new Date()): ViewContext {
  return { meId: ME_ID, now, statuses: db.statuses };
}

export interface TicketFilter {
  statusIds?: string[];
  channel?: Ticket['channel'];
  requesterId?: string;
  /** Tickets de uma organização (empresa do solicitante). No modo real vai ao servidor (`?company=`). */
  orgId?: string;
  assigneeId?: string;
  query?: string;
}

export function listTickets(filter: TicketFilter = {}): Promise<Ticket[]> {
  return simulate(() =>
    db.tickets.filter(
      (t) =>
        (!filter.statusIds || filter.statusIds.includes(t.statusId)) &&
        (!filter.channel || t.channel === filter.channel) &&
        (!filter.requesterId || t.requesterId === filter.requesterId) &&
        (!filter.orgId || (t.orgId ?? db.users.find((u) => u.id === t.requesterId)?.orgId) === filter.orgId) &&
        (!filter.assigneeId || t.assigneeId === filter.assigneeId) &&
        (!filter.query || t.subject.toLowerCase().includes(filter.query.toLowerCase())),
    ),
  );
}

export function getTicket(id: number): Promise<Ticket> {
  return simulate(() => {
    const t = db.tickets.find((x) => x.id === id) ?? db.trash.find((x) => x.id === id);
    if (!t) throw new ApiError('Ticket não encontrado.', { status: 404 });
    return t;
  });
}

export function listViews(): Promise<View[]> {
  return simulate(() => db.views, { critical: true });
}

/** Contadores de todas as views por `countKey`. Nunca falha. */
export function getViewCounts(): Promise<Record<string, number>> {
  return simulate(() => countViews(db.views, db.tickets, viewContext()), { critical: true });
}

export function runView(viewId: string, _opts: { offset?: number; limit?: number; type?: string } = {}): Promise<Ticket[]> {
  return simulate(() => {
    const v = db.views.find((x) => x.id === viewId);
    if (!v) throw new ApiError('Visualização não encontrada.');
    const list = runViewPure(v, db.tickets, viewContext());
    // Mesmo contrato do servidor: `type` é lista separada por vírgula e `none` = sem tipo.
    const types = _opts.type?.split(',').filter(Boolean);
    return types?.length ? list.filter((t) => types.includes(t.type ?? 'none')) : list;
  });
}

export type TicketPatch = Partial<
  Pick<Ticket, 'subject' | 'requesterId' | 'assigneeId' | 'assigneeGroupId' | 'statusId' | 'priority' | 'type' | 'tags' | 'followerIds' | 'ccIds' | 'customFields'>
> & {
  /** Campos personalizados que mudaram, por slug: valor novo ou `null` para apagar (ausente não mexe). */
  fieldValues?: Record<string, FieldValue | null>;
  /** Formulário do ticket; `null` volta ao padrão. */
  formId?: string | null;
};

const fieldErr = (errors: Record<string, string>) =>
  new ApiError(Object.values(errors)[0] ?? 'Dados inválidos.', { status: 400, fieldErrors: { custom_fields: [JSON.stringify(errors)] }, body: { custom_fields: errors } });

/** Valida os valores enviados como o servidor: campo desconhecido, desativado (só aceita `null`) e tipo errado = 400 por campo. */
function checkFieldValues(values: Record<string, FieldValue | null>): void {
  const errors: Record<string, string> = {};
  for (const [slug, v] of Object.entries(values)) {
    const f = db.fields.find((x) => x.slug === slug || x.id === slug);
    if (!f) {
      errors[slug] = 'Campo personalizado inexistente.';
      continue;
    }
    if (!isFilled(v)) continue;
    if (!f.active) errors[slug] = 'Este campo está desativado: só é possível apagar o valor.';
    else if (f.type === 'number' && typeof v !== 'number') errors[slug] = 'Informe um número (até 9 dígitos inteiros e 6 decimais, com ponto).';
    else if (f.type === 'checkbox' && typeof v !== 'boolean') errors[slug] = 'Informe verdadeiro ou falso.';
    else if (f.type === 'date' && !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) errors[slug] = 'Informe uma data válida (AAAA-MM-DD).';
    else if (f.type === 'dropdown' && !f.options?.some((o) => o.value === v)) errors[slug] = 'Escolha uma das opções da lista.';
    else if ((f.type === 'text' && String(v).length > 2000) || (f.type === 'textarea' && String(v).length > 10000)) errors[slug] = 'Texto longo demais.';
  }
  if (Object.keys(errors).length) throw fieldErr(errors);
}

/** Mescla o patch (`null` apaga) em `current` e devolve os valores e os eventos de auditoria `campo: Título: a → b`. */
function mergeFieldValues(current: Record<string, FieldValue>, patch: Record<string, FieldValue | null>): { next: Record<string, FieldValue>; notes: string[] } {
  const next = { ...current };
  const notes: string[] = [];
  for (const [rawSlug, v] of Object.entries(patch)) {
    const f = db.fields.find((x) => x.slug === rawSlug || x.id === rawSlug)!;
    const slug = fieldKey(f);
    const before = current[slug];
    const after = isFilled(v) ? v : undefined;
    if (before === after) continue;
    if (after === undefined) delete next[slug];
    else next[slug] = after;
    const cut = (t: string) => (t.length > 50 ? `${t.slice(0, 49)}…` : t);
    notes.push(`campo: ${f.title}: ${cut(formatFieldValue(f, before))} → ${cut(formatFieldValue(f, after))}`);
  }
  return { next, notes };
}

/** Obrigatórios que faltam no ticket (formulário dele, ou o padrão); vazio se está tudo preenchido. */
function missingFor(formId: string | undefined, values: Record<string, FieldValue>) {
  const slots = slotsFor(formForTicket(formId, db.forms), db.fields, values);
  return missingRequired(slots, values).map((s) => ({ id: s.field.id, slug: fieldKey(s.field), title: s.field.title }));
}

export interface NewComment {
  authorId: string;
  public: boolean;
  bodyHtml: string;
  channel?: Comment['channel'];
  /** Anexos escolhidos no compositor. Só o modo real os envia (multipart); o mock os ignora. */
  files?: File[];
}

function nextId(): number {
  return db.tickets.reduce((m, t) => Math.max(m, t.id), 0) + 1;
}

let seq = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${++seq}`;
}

/** Aplica patch e/ou novo comentário; devolve o ticket atualizado. */
export async function suggestResolutionWindow(_id: number): Promise<{ started: string; ended: string }> {
  const now = new Date();
  const ended = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString();
  return { started: ended, ended };
}

export function updateTicket(id: number, patch: TicketPatch = {}, comment?: NewComment, _opts: { macroIds?: string[]; resolutionWindow?: { started: string; ended: string } } = {}): Promise<Ticket> {
  return simulate(() => {
    const i = db.tickets.findIndex((t) => t.id === id);
    if (i < 0) throw new ApiError('Ticket não encontrado.');
    const prev = db.tickets[i];
    const now = new Date().toISOString();
    const events: AuditEvent[] = [];
    const { fieldValues: fvPatch, formId: formPatch, ...plain } = patch;
    if (fvPatch) checkFieldValues(fvPatch);
    if (formPatch && !db.forms.some((f) => f.id === formPatch)) throw new ApiError('Formulário não encontrado.', { status: 400, fieldErrors: { form_id: ['Formulário não encontrado.'] } });
    const merged = fvPatch ? mergeFieldValues(prev.fieldValues ?? {}, fvPatch) : { next: prev.fieldValues ?? {}, notes: [] as string[] };
    const newFormId: string = formPatch === undefined ? prev.formId : formPatch ? formPatch : (db.forms.find((f) => f.isDefault)?.id ?? prev.formId);
    // Resolver/fechar exige os obrigatórios (nada é gravado se faltar), como o servidor.
    const category = (id: string) => db.statuses.find((s) => s.id === id)?.category;
    if (plain.statusId && plain.statusId !== prev.statusId && category(plain.statusId) === 'solved' && category(prev.statusId) !== 'solved') {
      const missing = missingFor(newFormId, merged.next);
      if (missing.length) throw requiredError(missing, 'resolver ou fechar');
    }
    if (newFormId !== prev.formId) events.push({ id: uid('e'), authorId: ME_ID, kind: 'field_change', text: `formulário → ${db.forms.find((f) => f.id === newFormId)?.name ?? '—'}`, createdAt: now });
    merged.notes.forEach((text) => events.push({ id: uid('e'), authorId: ME_ID, kind: 'field_change', text, createdAt: now }));
    (Object.keys(plain) as (keyof typeof plain)[]).forEach((key) => {
      if (key === 'customFields' || JSON.stringify(prev[key]) === JSON.stringify(plain[key])) return;
      if (key === 'type') {
        // Igual ao servidor: evento de auditoria "tipo → Incidente" (— ao limpar), sem De/Para.
        events.push({ id: uid('e'), authorId: ME_ID, kind: 'field_change', text: `tipo → ${patch.type ? TYPE_LABEL[patch.type] : '—'}`, createdAt: now });
        return;
      }
      events.push({
        id: uid('e'),
        authorId: ME_ID,
        kind: 'field_change',
        text: `${key} alterado`,
        meta: { De: String(prev[key] ?? '-'), Para: String(patch[key] ?? '-') },
        createdAt: now,
      });
    });
    const comments = comment
      ? [...prev.comments, { id: uid('c'), channel: 'web_form' as const, attachments: [], createdAt: now, authorId: comment.authorId, public: comment.public, bodyHtml: comment.bodyHtml, ...(comment.channel ? { channel: comment.channel } : {}) }]
      : prev.comments;
    const next: Ticket = {
      ...prev,
      ...plain,
      customFields: { ...prev.customFields, ...plain.customFields },
      fieldValues: merged.next,
      formId: newFormId,
      comments,
      events: [...prev.events, ...events],
      updatedAt: now,
    };
    db.tickets[i] = next;
    return next;
  });
}

/** Janela da solução de um ticket no fechamento em lote (ISO UTC, no minuto). Só o modo real a envia ao backend. */
export interface BulkResolution {
  id: number;
  started: string;
  ended: string;
}

export interface BulkChange {
  assigneeId?: string;
  priority?: Priority;
  statusId?: string;
  /**
   * Fechamento em lote (statusId de categoria resolvida): a janela de CADA ticket, confirmada pelo agente.
   * Sem ela, o modo real calcula a sugestão D4 por ticket (compatibilidade). O mock ignora.
   */
  resolutions?: BulkResolution[];
}

/** Sugestão de janela para um ticket do lote (para o diálogo de confirmação). */
export interface ResolutionSuggestion {
  id: number;
  reference?: string;
  subject: string;
  createdAt: string;
  started: string;
  ended: string;
}

/** Janela sugerida de vários tickets (o diálogo do fechamento em lote). No mock: da criação até agora, só para exibir. */
export async function suggestResolutionWindows(ids: number[]): Promise<ResolutionSuggestion[]> {
  const ended = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  return ids.flatMap((id) => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) return [];
    const created = new Date(Math.floor(Date.parse(t.createdAt) / 60000) * 60000).toISOString();
    const started = created > ended ? ended : created; // ticket simulado "do futuro": a janela nunca começa depois do fim
    return [{ id, subject: t.subject, createdAt: started, started, ended }];
  });
}
export interface BulkResult {
  updated: Ticket[];
  failed: { id: number; message: string }[];
}

/** Ação em lote: um `updateTicket` por ticket; falhas por ticket vêm em `failed`. */
export async function bulkUpdate(ids: number[], change: BulkChange): Promise<BulkResult> {
  const { resolutions: _resolutions, ...patch } = change; // as janelas só importam ao backend real
  const updated: Ticket[] = [];
  const failed: BulkResult['failed'] = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        updated.push(await updateTicket(id, patch));
      } catch (e) {
        failed.push({ id, message: e instanceof Error ? e.message : 'Não foi possível alterar o ticket.' });
      }
    }),
  );
  return { updated: updated.sort((a, b) => a.id - b.id), failed };
}

export interface NewTicketInput {
  subject: string;
  requesterId: string;
  bodyHtml: string;
  assigneeGroupId?: string;
  assigneeId?: string;
  statusId?: string;
  priority?: Priority;
  type?: Ticket['type'];
  tags?: string[];
  channel?: Ticket['channel'];
  ccIds?: string[];
  followerIds?: string[];
  customFields?: Ticket['customFields'];
  /** Formulário escolhido (`form_id`); a equipe e o tipo padrão dele valem se o envio não trouxe os seus. */
  formId?: string;
  /** Campos personalizados (slug -> valor). */
  fieldValues?: Record<string, FieldValue | null>;
  /** Primeiro comentário público? Padrão: true. `false` cria o ticket com observação interna. */
  public?: boolean;
  authorId?: string;
  /** Anexos da descrição. Só o modo real os envia (multipart). */
  files?: File[];
  /** Macros usadas no formulário (só o modo real chama `apply-macro`). */
  macroIds?: string[];
}

export function createTicket(input: NewTicketInput): Promise<Ticket> {
  return simulate(() => {
    const now = new Date().toISOString();
    const id = nextId();
    const requester = db.users.find((u) => u.id === input.requesterId);
    const org = db.orgs.find((o) => o.id === requester?.orgId);
    const channel = input.channel ?? 'web_form';
    const form = input.formId ? db.forms.find((f) => f.id === input.formId) : undefined;
    if (input.formId && !form) throw new ApiError('Formulário não encontrado.', { status: 400, fieldErrors: { form_id: ['Formulário não encontrado.'] } });
    const given = input.fieldValues ?? {};
    checkFieldValues(given);
    const values = cleanValues(given as Record<string, FieldValue>);
    // Obrigatório já na criação: o ticket nem é criado. Sem `form_id`, vale o formulário padrão (que o servidor também exige).
    const missing = missingFor(form?.id, values);
    if (missing.length) throw requiredError(missing, 'criar');
    const ticket: Ticket = {
      id,
      subject: input.subject,
      requesterId: input.requesterId,
      assigneeGroupId: input.assigneeGroupId ?? form?.defaultTeamId ?? org?.groupId ?? db.groups[0].id,
      assigneeId: input.assigneeId,
      followerIds: input.followerIds ?? [],
      ccIds: input.ccIds ?? [],
      tags: input.tags ?? [],
      type: input.type ?? form?.defaultType,
      priority: input.priority,
      statusId: input.statusId ?? (input.assigneeId ? 'open' : 'new'),
      channel,
      formId: form?.id ?? db.forms.find((f) => f.isDefault)?.id ?? '',
      customFields: input.customFields ?? {},
      fieldValues: values,
      comments: [{ id: uid('c'), authorId: input.authorId ?? input.requesterId, public: input.public ?? true, bodyHtml: input.bodyHtml, channel, attachments: [], createdAt: now }],
      events: [{ id: uid('e'), authorId: 'system', kind: 'notification', text: 'Ticket criado', createdAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    db.tickets.push(ticket);
    return ticket;
  });
}

/** Aplica o resultado do motor de gatilhos (patch + eventos de auditoria). Nunca falha: roda depois do envio. */
export function applyAutomation(id: number, patch: TicketPatch, events: AuditEvent[]): Promise<Ticket> {
  return simulate(
    () => {
      const i = db.tickets.findIndex((t) => t.id === id);
      if (i < 0) throw new ApiError('Ticket não encontrado.');
      const prev = db.tickets[i];
      const { fieldValues: _fv, formId: _form, ...plain } = patch; // gatilhos não mexem em campos personalizados
      const next: Ticket = {
        ...prev,
        ...plain,
        customFields: { ...prev.customFields, ...plain.customFields },
        events: [...prev.events, ...events],
        updatedAt: new Date().toISOString(),
      };
      db.tickets[i] = next;
      return next;
    },
    { critical: true },
  );
}

/** Resultado de apagar: o que o servidor confirmou e o que falhou (com a frase pronta para mostrar). */
export interface DeleteResult {
  deleted: number[];
  failed: { id: number; message: string; status?: number; code?: string }[];
}

export function deleteTickets(ids: number[]): Promise<DeleteResult> {
  return simulate(() => {
    const now = new Date().toISOString();
    for (const t of db.tickets.filter((x) => ids.includes(x.id))) db.trash.push({ ...t, deletedAt: now, deletedByName: 'Você' });
    db.tickets = db.tickets.filter((t) => !ids.includes(t.id));
    return { deleted: ids, failed: [] };
  });
}

export function restoreTicket(id: number): Promise<Ticket> {
  return simulate(() => {
    const t = db.trash.find((x) => x.id === id);
    if (!t) throw new ApiError(`O ticket #${id} não está apagado ou não foi encontrado.`, { status: 404 });
    db.trash = db.trash.filter((x) => x.id !== id);
    const { deletedAt: _a, deletedByName: _b, ...restored } = t;
    const back: Ticket = { ...restored, events: [...t.events, { id: uid('e'), authorId: ME_ID, kind: 'field_change', text: 'ticket restaurado', createdAt: new Date().toISOString() }] };
    db.tickets = [...db.tickets, back].sort((a, b) => a.id - b.id);
    return back;
  });
}

/** Contatos de CC do ticket (mesma derivação da tela). */
const ccOf = (t: Ticket): TicketContact[] => ticketCcList(t, (v) => db.users.find((x) => x.id === v));

function saveRelations(id: number, fn: (t: Ticket) => Partial<Ticket>, note: string): Ticket {
  const i = db.tickets.findIndex((t) => t.id === id);
  if (i < 0) throw new ApiError('Ticket não encontrado.', { status: 404 });
  const now = new Date().toISOString();
  const next: Ticket = { ...db.tickets[i]!, ...fn(db.tickets[i]!), updatedAt: now };
  next.events = [...next.events, { id: uid('e'), authorId: ME_ID, kind: 'field_change', text: note, createdAt: now }];
  db.tickets[i] = next;
  return next;
}


export function addTicketCc(id: number, input: { email: string; name?: string }): Promise<Ticket> {
  return simulate(() => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw new ApiError('Ticket não encontrado.', { status: 404 });
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError('Insira um endereço de email válido.', { status: 400, fieldErrors: { email: ['Insira um endereço de email válido.'] } });
    const requester = db.users.find((u) => u.id === t.requesterId);
    if (requester && requester.email.toLowerCase() === email) throw new ApiError('Este e-mail é o do solicitante, que já recebe as respostas.', { status: 400 });
    const current = ccOf(t);
    if (current.some((c) => c.email.toLowerCase() === email)) return t;
    if (current.length >= MAX_CC) throw new ApiError(`Um ticket aceita no máximo ${MAX_CC} e-mails em cópia.`, { status: 400 });
    const list = [...current, { id: `cc-${uid('x')}`, name: input.name?.trim() ?? '', email }];
    return saveRelations(id, () => ({ ccList: list, ccIds: list.map((c) => c.email) }), `cc + ${email}`);
  });
}

export function removeTicketCc(id: number, ccId: string): Promise<Ticket> {
  return simulate(() => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw new ApiError('Ticket não encontrado.', { status: 404 });
    const gone = ccOf(t).find((c) => c.id === ccId);
    if (!gone) throw new ApiError('Não encontrado.', { status: 404 });
    const list = ccOf(t).filter((c) => c.id !== ccId);
    return saveRelations(id, () => ({ ccList: list, ccIds: list.map((c) => c.email) }), `cc − ${gone.email}`);
  });
}

export function addTicketFollower(id: number, userId: string): Promise<Ticket> {
  return simulate(() => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw new ApiError('Ticket não encontrado.', { status: 404 });
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new ApiError('Usuário não encontrado.', { status: 400 });
    if (user.id === t.requesterId) throw new ApiError('O solicitante já acompanha o ticket.', { status: 400 });
    if (t.followerIds.includes(userId)) return t;
    return saveRelations(id, (x) => ({ followerIds: [...x.followerIds, userId], followerList: undefined }), `seguidor + ${user.name}`);
  });
}

export function removeTicketFollower(id: number, userId: string): Promise<Ticket> {
  return simulate(() => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw new ApiError('Ticket não encontrado.', { status: 404 });
    if (!t.followerIds.includes(userId)) throw new ApiError('Não encontrado.', { status: 404 });
    const name = db.users.find((u) => u.id === userId)?.name ?? userId;
    return saveRelations(id, (x) => ({ followerIds: x.followerIds.filter((f) => f !== userId), followerList: undefined }), `seguidor − ${name}`);
  });
}

/** Resumo SIMULADO (modo mock): monta um texto plausível a partir do ticket. No modo real o servidor chama o provedor de IA. */
export function generateAiSummary(id: number): Promise<AiSummary> {
  return simulate(() => {
    const ticket = db.tickets.find((x) => x.id === id);
    if (!ticket) throw new ApiError('Ticket não encontrado.', { status: 404 });
    const requester = db.users.find((u) => u.id === ticket.requesterId)?.name;
    const f = ticket.customFields;
    const parts = [`${requester ?? 'O cliente'} entrou em contato${ticket.channel === 'email' ? ' por e-mail' : ' pelo formulário web'}`];
    parts[0] += f.resumo ? `: ${f.resumo.replace(/[.…]+$/, '')}.` : '.';
    if (f.topico) parts.push(`Tópico identificado: ${f.topico}.`);
    if (f.sentimento) parts.push(`Sentimento ${f.sentimento.toLowerCase()}.`);
    parts.push(`${ticket.comments.length} ${ticket.comments.length === 1 ? 'mensagem' : 'mensagens'} na conversa.`);
    return { summary: parts.join(' '), generatedAt: new Date().toISOString(), provider: 'simulado', truncated: false };
  });
}

/** Funde `sourceIds` em `targetId`: origens ficam Resolvidas com tag `mesclado`; o alvo recebe um evento. */
export function mergeTickets(targetId: number, sourceIds: number[]): Promise<{ target: Ticket; sources: Ticket[] }> {
  return simulate(() => {
    const target = db.tickets.find((t) => t.id === targetId);
    if (!target) throw new ApiError('Ticket de destino não encontrado.');
    const now = new Date().toISOString();
    const sources: Ticket[] = [];
    for (const sid of sourceIds.filter((x) => x !== targetId)) {
      const i = db.tickets.findIndex((t) => t.id === sid);
      if (i < 0) continue;
      const s = db.tickets[i];
      const merged: Ticket = {
        ...s,
        statusId: 'solved',
        tags: [...new Set([...s.tags, 'mesclado'])],
        events: [...s.events, { id: uid('e'), authorId: ME_ID, kind: 'field_change', text: `Mesclado no ticket #${targetId}`, createdAt: now }],
        updatedAt: now,
      };
      db.tickets[i] = merged;
      sources.push(merged);
    }
    const ti = db.tickets.findIndex((t) => t.id === targetId);
    const updated: Ticket = {
      ...target,
      events: [...target.events, { id: uid('e'), authorId: ME_ID, kind: 'field_change', text: `Tickets mesclados: ${sources.map((s) => `#${s.id}`).join(', ')}`, createdAt: now }],
      updatedAt: now,
    };
    db.tickets[ti] = updated;
    return { target: updated, sources };
  });
}

const NEW_TICKET_POOL: { subject: string; body: string; requesterId: string; channel: Ticket['channel']; priority: Priority }[] = [
  { subject: 'Cupom de desconto não aplica no checkout', body: 'O cupom BEMVINDO10 retorna "cupom inválido" mesmo dentro da validade.', requesterId: 'u10', channel: 'web_form', priority: 'normal' },
  { subject: 'Preciso de ajuda com a conciliação bancária', body: 'Os lançamentos de ontem não bateram com o extrato. Podem verificar?', requesterId: 'u2', channel: 'email', priority: 'high' },
  { subject: 'Atualização do cadastro de motoristas', body: 'Precisamos incluir 5 novos motoristas na plataforma com acesso ao app.', requesterId: 'u8', channel: 'email', priority: 'low' },
  { subject: 'Erro ao imprimir etiqueta de envio', body: 'A etiqueta sai cortada ao imprimir em impressora térmica 10x15.', requesterId: 'u3', channel: 'web_form', priority: 'normal' },
  { subject: 'Paciente não recebe confirmação por SMS', body: 'Alguns pacientes relatam que não receberam o SMS de confirmação da consulta.', requesterId: 'u6', channel: 'email', priority: 'high' },
];

let poolIdx = 0;

/** Simula a chegada de um ticket novo (sem atraso/falha). */
export function simulateIncomingTicket(): Ticket {
  const spec = NEW_TICKET_POOL[poolIdx++ % NEW_TICKET_POOL.length];
  const now = new Date().toISOString();
  const org = db.orgs.find((o) => o.id === db.users.find((u) => u.id === spec.requesterId)?.orgId);
  const ticket: Ticket = {
    id: nextId(),
    subject: spec.subject,
    requesterId: spec.requesterId,
    assigneeGroupId: org?.groupId ?? db.groups[0].id,
    followerIds: [],
    ccIds: [],
    tags: [],
    type: 'incident',
    priority: spec.priority,
    statusId: 'new',
    channel: spec.channel,
    formId: db.forms.find((f) => f.isDefault)?.id ?? '',
    fieldValues: {},
    customFields: {},
    sla: { name: 'Primeira resposta', target: 'first_reply', dueAt: new Date(Date.now() + 4 * 3_600_000).toISOString(), state: 'ok' },
    comments: [{ id: uid('c'), authorId: spec.requesterId, public: true, bodyHtml: `<p>${spec.body}</p>`, channel: spec.channel, attachments: [], createdAt: now }],
    events: [{ id: uid('e'), authorId: 'system', kind: 'notification', text: 'Ticket criado', createdAt: now }],
    createdAt: now,
    updatedAt: now,
  };
  db.tickets.push(ticket);
  return ticket;
}

const REPLIES = ['Obrigado pelo retorno! Segue o que você pediu.', 'Testei aqui e o problema continua acontecendo.', 'Consegui resolver parte, mas ainda falta o último passo.'];

/** Simula resposta de cliente num ticket não resolvido (Pendente volta para Aberto). Devolve null se não houver candidato. */
export function simulateCustomerReply(): Ticket | null {
  const open = db.tickets.filter((t) => db.statuses.find((s) => s.id === t.statusId)?.category !== 'solved' && t.assigneeId);
  if (open.length === 0) return null;
  const prev = open[Math.floor(Math.random() * open.length)];
  const now = new Date().toISOString();
  const wasPending = db.statuses.find((s) => s.id === prev.statusId)?.category === 'pending';
  const next: Ticket = {
    ...prev,
    statusId: wasPending ? 'open' : prev.statusId,
    comments: [
      ...prev.comments,
      { id: uid('c'), authorId: prev.requesterId, public: true, bodyHtml: `<p>${REPLIES[Math.floor(Math.random() * REPLIES.length)]}</p>`, channel: prev.channel, attachments: [], createdAt: now },
    ],
    updatedAt: now,
  };
  db.tickets[db.tickets.findIndex((t) => t.id === prev.id)] = next;
  return next;
}

/** Views iniciais da store (antes do primeiro `listViews`). */
export { views as initialViews } from './data';

/** Compatível com o modo real (sem paginação no mock). */
export const viewPageMeta: Record<string, { total: number; loaded: number; hasMore: boolean; offset: number }> = {};
export const VIEW_PAGE = 100;
export const HOME_PAGE = 100;

/** Mock: cria visão pessoal em memória. */
export async function createPersonalView(input: { name: string; filters?: Record<string, string> }): Promise<View> {
  const id = `pv:local-${Date.now()}`;
  const view: View = {
    id,
    name: input.name.trim() || 'Sem nome',
    conditions: { all: [] },
    columns: ['status', 'subject', 'requester', 'createdAt', 'type', 'priority'],
    countKey: id,
    query: input.filters ?? {},
    origin: 'personal',
  };
  db.views.push(view);
  return view;
}

export async function updatePersonalView(
  viewId: string,
  input: { name?: string; filters?: Record<string, string> },
): Promise<View> {
  const i = db.views.findIndex((v) => v.id === viewId);
  if (i < 0) throw new ApiError('Visualização não encontrada.', { status: 404 });
  const prev = db.views[i]!;
  const next: View = {
    ...prev,
    name: input.name !== undefined ? input.name.trim() || prev.name : prev.name,
    query: input.filters !== undefined ? input.filters : prev.query,
  };
  db.views[i] = next;
  return next;
}

export async function deletePersonalView(viewId: string): Promise<void> {
  db.views = db.views.filter((v) => v.id !== viewId);
}
