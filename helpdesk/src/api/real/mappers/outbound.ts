import { factoryStatusFor, toBackendCategory } from './status';
import type { StageCategoryDto, TagDto, TicketDetailDto } from './dto';
import type { FieldValue, Priority, StatusCategory, TicketStatus } from '@/types/domain';

/**
 * MAPEADORES DE IDA (Helpdesk -> Resolv). Funções puras: viram o que o usuário fez na tela em chamadas ao backend.
 * O corpo das mensagens já chega aqui em markdown (`htmlToMarkdown`); quem executa as chamadas é `real/tickets.ts`.
 */

/** Campos do patch do Helpdesk (espelha `TicketPatch` de `mock/tickets.ts`, sem importar o mock). */
export interface PatchInput {
  subject?: string;
  requesterId?: string;
  assigneeId?: string;
  assigneeGroupId?: string;
  statusId?: string;
  priority?: Priority;
  type?: string;
  tags?: string[];
  followerIds?: string[];
  ccIds?: string[];
  /** Campos de IA (locais, não vão ao backend). */
  customFields?: Record<string, string | undefined>;
  /** Campos personalizados que mudaram (slug -> valor, `null` apaga): `PATCH custom_fields`. */
  fieldValues?: Record<string, FieldValue | null>;
  /** Formulário do ticket (`form_id`); `null` volta ao padrão. */
  formId?: string | null;
}
export type PatchKey = keyof PatchInput;
/** O que um passo cobre: campo do patch, a mensagem ou uma macro (`macro:<id>`). */
export type Covers = PatchKey | 'comment' | `macro:${string}`;

export interface OutboundComment {
  markdown: string;
  public: boolean;
  files?: File[];
}

/** Campos que o backend NÃO tem: valem só no navegador (camada local), nunca viajam. */
export const LOCAL_ONLY_KEYS: readonly PatchKey[] = ['subject', 'requesterId', 'customFields'];

export const KEY_LABEL: Record<PatchKey | 'comment' | 'macro', string> = {
  subject: 'assunto',
  requesterId: 'solicitante',
  assigneeId: 'responsável',
  assigneeGroupId: 'grupo',
  statusId: 'status',
  priority: 'prioridade',
  type: 'tipo',
  tags: 'etiquetas',
  followerIds: 'seguidores',
  ccIds: 'CC',
  customFields: 'campos de IA',
  fieldValues: 'campos personalizados',
  formId: 'formulário',
  comment: 'mensagem',
  macro: 'macro',
};

export const labelOf = (k: Covers): string => (k.startsWith('macro:') ? KEY_LABEL.macro : KEY_LABEL[k as PatchKey | 'comment']);

export type StepKind = 'macro' | 'props' | 'follow' | 'unfollow' | 'cc_add' | 'cc_remove' | 'follower_add' | 'follower_remove' | 'reply' | 'close' | 'stage';

export interface PlanStep {
  kind: StepKind;
  /** O que este passo aplica (para o relato de falha parcial). */
  covers: Covers[];
  /** Corpo JSON (props, reply, stage). `close` e `reply` fechando ganham as datas na execução (`needsWindow`). */
  body?: Record<string, unknown>;
  needsWindow?: boolean;
  files?: File[];
  note?: string;
}

export interface TicketPlan {
  steps: PlanStep[];
  /** Parte que fica só no navegador. */
  local: PatchInput;
  /** Chaves locais (para o aviso "somente neste navegador"). */
  localKeys: PatchKey[];
  /** Impede tudo ANTES de qualquer chamada (regra do backend que a tela não conhece). */
  blocked?: string;
}

export interface CurrentTicket {
  statusId: string;
  followerIds: string[];
  /** CC de terceiros do servidor (id do registro + e-mail), para calcular o que entra e o que sai. */
  ccs?: { id: string; email: string }[];
}

/** Categoria (Helpdesk) -> `new_status` aceito pelo `reply` (o backend não aceita `new`: responder já abre). */
export function replyStatusFor(category: StatusCategory): Exclude<StageCategoryDto, 'new'> {
  const c = toBackendCategory(category);
  return c === 'new' ? 'open' : (c as Exclude<StageCategoryDto, 'new'>);
}

/** Tags (nomes) -> ids; devolve também os nomes que não existem no backend. */
export function resolveTagIds(names: string[], tags: Pick<TagDto, 'id' | 'name'>[]): { ids: number[]; missing: string[] } {
  const byName = new Map(tags.map((t) => [t.name.trim().toLowerCase(), t.id]));
  const ids: number[] = [];
  const missing: string[] = [];
  for (const raw of names) {
    const id = byName.get(raw.trim().toLowerCase());
    if (id === undefined) missing.push(raw);
    else if (!ids.includes(id)) ids.push(id);
  }
  return { ids, missing };
}

export interface PlanInput {
  patch: PatchInput;
  comment?: OutboundComment;
  current: CurrentTicket;
  statuses: TicketStatus[];
  meId: string;
  /** Todas as tags do backend (a execução já criou as que faltavam). */
  tags: Pick<TagDto, 'id' | 'name'>[];
  /** Estágio atual do ticket no servidor (id do stage). */
  currentStageId?: string;
  /** Macros aplicadas no formulário: o backend registra e grava categoria/prioridade/responsável/etiquetas delas (soma, não zera). */
  macroIds?: string[];
}

/**
 * Transforma "o que o agente fez" (patch + mensagem) em passos do backend, na ORDEM SEGURA:
 *  0. `macro`   POST apply-macro (uma por macro usada): soma campos, idempotente;
 *  1. `props`   PATCH /tickets/{id}/  (prioridade, equipe, responsável, etiquetas): idempotente, valida cedo;
 *  2. `follow`/`unfollow` do PRÓPRIO usuário: idempotente;
 *  3. `reply` (mensagem; resposta pública leva `new_status`) ou `close`: a parte NÃO idempotente (duplica se repetir);
 *  4. `stage` (bulk-status): só para mudar de status SEM resposta pública (o `reply` e o `close/` já levam o `stage`).
 * Mensagem antes do estágio: o texto digitado é o que o agente mais perde se algo falhar no meio.
 */
export function planTicketUpdate(input: PlanInput): TicketPlan {
  const { patch, comment, current, statuses, meId } = input;
  const steps: PlanStep[] = [];
  const local: PatchInput = {};
  const localKeys: PatchKey[] = [];

  for (const key of LOCAL_ONLY_KEYS) {
    if (key in patch) {
      (local as Record<string, unknown>)[key] = patch[key];
      localKeys.push(key);
    }
  }

  // 0. macros usadas no formulário
  for (const id of input.macroIds ?? []) steps.push({ kind: 'macro', covers: [`macro:${id}`], body: { macro_id: Number(id) } });

  // 1. propriedades
  const props: Record<string, unknown> = {};
  const covers: PatchKey[] = [];
  if (patch.priority) {
    props.priority = patch.priority;
    covers.push('priority');
  }
  if (patch.assigneeGroupId) {
    props.team = Number(patch.assigneeGroupId);
    covers.push('assigneeGroupId');
  }
  if ('assigneeId' in patch) {
    props.assignee = patch.assigneeId ? Number(patch.assigneeId) : null;
    covers.push('assigneeId');
  }
  if (patch.tags) {
    props.tags = resolveTagIds(patch.tags, input.tags).ids;
    covers.push('tags');
  }
  if ('type' in patch) {
    props.type = patch.type || null; // limpar o tipo = null (ausente não mexe)
    covers.push('type');
  }
  if (patch.fieldValues && Object.keys(patch.fieldValues).length > 0) {
    props.custom_fields = patch.fieldValues; // `null` apaga o valor; chave ausente não mexe
    covers.push('fieldValues');
  }
  if ('formId' in patch) {
    props.form_id = patch.formId ? Number(patch.formId) : null; // null = volta ao formulário padrão
    covers.push('formId');
  }
  if (covers.length > 0) steps.push({ kind: 'props', covers, body: props });

  // 2. seguir / deixar de seguir: o próprio usuário por follow/unfollow; os demais seguidores por `followers/`
  if (patch.followerIds) {
    const wantsMe = patch.followerIds.includes(meId);
    const hasMe = current.followerIds.includes(meId);
    if (wantsMe && !hasMe) steps.push({ kind: 'follow', covers: ['followerIds'] });
    else if (!wantsMe && hasMe) steps.push({ kind: 'unfollow', covers: ['followerIds'] });
    const others = patch.followerIds.filter((id) => id !== meId);
    const currentOthers = current.followerIds.filter((id) => id !== meId);
    for (const id of others.filter((x) => !currentOthers.includes(x))) steps.push({ kind: 'follower_add', covers: ['followerIds'], body: { user_id: Number(id) } });
    for (const id of currentOthers.filter((x) => !others.includes(x))) steps.push({ kind: 'follower_remove', covers: ['followerIds'], body: { user_id: Number(id) } });
  }

  // 2b. CC de terceiros (e-mails): entra o que é novo, sai o que foi tirado (por id do registro de CC)
  if (patch.ccIds) {
    const wanted = [...new Set(patch.ccIds.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const have = current.ccs ?? [];
    for (const email of wanted.filter((e) => !have.some((c) => c.email.toLowerCase() === e))) steps.push({ kind: 'cc_add', covers: ['ccIds'], body: { email } });
    for (const c of have.filter((c) => !wanted.includes(c.email.toLowerCase()))) steps.push({ kind: 'cc_remove', covers: ['ccIds'], body: { cc_id: Number(c.id) } });
  }

  // 3 e 4. mensagem + status
  const cur = statuses.find((s) => s.id === current.statusId);
  const curCategory: StatusCategory = cur?.category ?? 'open';
  const explicit = patch.statusId !== undefined && patch.statusId !== current.statusId;
  const target = explicit ? statuses.find((s) => s.id === patch.statusId) : undefined;
  const hasMsg = Boolean(comment && comment.markdown.trim());

  const statusStep = (): PlanStep | 'blocked' | null => {
    if (!target) return null;
    if (target.category === 'solved') return curCategory === 'solved' ? null : { kind: 'close', covers: ['statusId'], needsWindow: true, body: { stage: Number(target.id) } };
    if (curCategory === 'solved') return 'blocked';
    if (target.id === current.statusId) return null;
    return { kind: 'stage', covers: ['statusId'], body: { stage_id: Number(target.id) } };
  };

  if (hasMsg && comment!.public) {
    const category: StatusCategory = target ? target.category : curCategory === 'solved' ? 'open' : curCategory;
    const newStatus = replyStatusFor(category);
    const body: Record<string, unknown> = { body: comment!.markdown, is_public: true, new_status: newStatus, with_signature: false };
    // O backend aceita `stage` no `reply` (resposta pública com `new_status`): fecha/reabre/muda já na coluna escolhida,
    // personalizada ou não, em UMA chamada. Só a categoria "Novo" não tem `new_status` próprio (responder abre).
    if (target && target.category !== 'new') body.stage = Number(target.id);
    const reply: PlanStep = { kind: 'reply', covers: ['comment', ...(explicit ? (['statusId'] as Covers[]) : [])], body, files: comment!.files, needsWindow: newStatus === 'closed' };
    steps.push(reply);
    if (target && target.category === 'new') {
      // "Novo" não se alcança pelo `reply` (que abre): a mensagem abre o ticket e a coluna "Novo" vem num passo à parte.
      steps.push({ kind: 'stage', covers: ['statusId'], body: { stage_id: Number(target.id) } });
    }
  } else {
    if (hasMsg) steps.push({ kind: 'reply', covers: ['comment'], body: { body: comment!.markdown, is_public: false, with_signature: false }, files: comment!.files });
    const status = statusStep();
    if (status === 'blocked') {
      return {
        steps,
        local,
        localKeys,
        blocked: 'Este ticket está fechado. No backend só uma resposta pública reabre um ticket fechado: escreva a mensagem para o solicitante e envie.',
      };
    }
    if (status) steps.push(status);
  }

  return { steps, local, localKeys };
}

// ---------------------------------------------------------------------------------------------------------------
// Fechamento (D4): início e término da solução
// ---------------------------------------------------------------------------------------------------------------

const MINUTE = 60_000;
const floorMinute = (ms: number): number => Math.floor(ms / MINUTE) * MINUTE;

/**
 * Janela de solução enviada ao fechar (o backend EXIGE início e término: `criação <= início <= término <= agora`, no
 * minuto, e a soma entra na franquia de horas de manutenção da empresa). O Helpdesk não pergunta; usa a sugestão que o
 * próprio backend documenta (D4):
 *  - início = a primeira transição para "Aberto" do ciclo atual (depois da última reabertura/fechamento); sem ela, a
 *    criação do ticket;
 *  - término = agora (no minuto).
 * Início nunca antes da criação (no minuto) e término nunca antes do início.
 */
export type ResolutionWindow = { started: string; ended: string };

export function resolutionWindow(dto: Pick<TicketDetailDto, 'created_at' | 'events'>, now: Date = new Date()): ResolutionWindow {
  const created = floorMinute(Date.parse(dto.created_at));
  const events = [...(dto.events ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  let lastClosed = -1;
  events.forEach((e, i) => {
    if (e.to_status === 'closed') lastClosed = i;
  });
  const cycle = events.slice(lastClosed + 1);
  const opened = cycle.find((e) => e.to_status === 'open');
  let started = opened ? floorMinute(Date.parse(opened.created_at)) : created;
  const ended0 = floorMinute(now.getTime());
  started = Math.max(created, Math.min(started, ended0));
  const ended = Math.max(started, ended0);
  return { started: new Date(started).toISOString(), ended: new Date(ended).toISOString() };
}

/**
 * Valida a janela escolhida pelo agente (mesmas regras do backend D4, no minuto):
 * criação <= início <= término <= agora.
 * `createdAt` e os horários podem ser ISO; o relógio do navegador adiantado >1 min gera o mesmo erro do backend.
 */
export function validateResolutionWindow(
  window: ResolutionWindow,
  createdAt: string,
  now: Date = new Date(),
): string | null {
  const created = floorMinute(Date.parse(createdAt));
  const started = floorMinute(Date.parse(window.started));
  const ended = floorMinute(Date.parse(window.ended));
  const nowM = floorMinute(now.getTime());
  if (Number.isNaN(created) || Number.isNaN(started) || Number.isNaN(ended)) {
    return 'Informe início e término válidos da solução.';
  }
  if (started < created) return 'O início da solução não pode ser anterior à criação do ticket.';
  if (ended < started) return 'O término da solução não pode ser anterior ao início.';
  if (ended > nowM + MINUTE) return 'Término no futuro: ajuste o horário do computador ou o término da solução.';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Corpos de requisição
// ---------------------------------------------------------------------------------------------------------------

export interface CreateTicketInput {
  subject: string;
  requesterId: string;
  markdown: string;
  teamId: number;
  priority?: Priority;
  /** Responsável já na criação (id de agente ativo). */
  assigneeId?: string;
  /** Status inicial por coluna (id do stage; inclui personalizados). */
  stageId?: string;
  /** Etiquetas por id. */
  tagIds?: number[];
  /** Tipo (`question|incident|problem|task`); só triagem interna. */
  type?: string;
  /** `false` = a descrição nasce como observação interna (o solicitante nunca a vê). Padrão: pública. */
  isPublic?: boolean;
  /** Formulário escolhido; a equipe e o tipo dele só valem se o envio não trouxe os seus. */
  formId?: string;
  /** Campos personalizados (slug -> valor). */
  fieldValues?: Record<string, FieldValue>;
  files?: File[];
}

/**
 * POST /tickets/ já triado: além de equipe, assunto, corpo, prioridade e solicitante, o backend aceita `assignee`,
 * `stage`, `tags` (ids) e `is_public`. Tudo é conferido ANTES de gravar: uma recusa (400) não deixa ticket pela metade.
 * Campos vazios não são enviados (o padrão do backend é: status novo, sem responsável, sem etiquetas, pública).
 */
export function createTicketBody(i: CreateTicketInput): Record<string, unknown> {
  return {
    team_id: i.teamId,
    subject: i.subject.trim(),
    body: i.markdown,
    requester_id: Number(i.requesterId),
    ...(i.priority ? { priority: i.priority } : {}),
    ...(i.assigneeId ? { assignee: Number(i.assigneeId) } : {}),
    ...(i.stageId ? { stage: Number(i.stageId) } : {}),
    ...(i.tagIds?.length ? { tags: i.tagIds } : {}),
    ...(i.type ? { type: i.type } : {}),
    ...(i.isPublic === false ? { is_public: false } : {}),
    ...(i.formId ? { form_id: Number(i.formId) } : {}),
    ...(i.fieldValues && Object.keys(i.fieldValues).length ? { custom_fields: i.fieldValues } : {}),
    with_signature: false,
  };
}

export interface NewTicketFormInput {
  subject: string;
  requesterId: string;
  markdown: string;
  teamId: number;
  priority?: Priority;
  assigneeId?: string;
  /** Status escolhido no formulário (id do stage do Helpdesk). */
  statusId?: string;
  tags?: string[];
  public?: boolean;
  followerIds?: string[];
  type?: PatchInput['type'];
  ccIds?: string[];
  customFields?: PatchInput['customFields'];
  formId?: string;
  fieldValues?: Record<string, FieldValue>;
  files?: File[];
}

/**
 * Divide o que o agente pediu ao criar em: (1) o corpo do ÚNICO `POST /tickets/` e (2) o que o POST não cobre e
 * precisa de chamadas depois (seguir, fechar já na criação, campos só locais). Sem (2) a criação é 1 chamada.
 *  - status "Novo" de fábrica não é enviado (é o padrão do backend);
 *  - status de categoria fechada NÃO vai no POST (fechar pede as datas da solução): vira o passo `close` depois;
 *  - os demais vão por `stage` (alcança também os personalizados).
 */
export function planNewTicket(input: NewTicketFormInput, ctx: { statuses: TicketStatus[]; tags: Pick<TagDto, 'id' | 'name'>[] }): { body: Record<string, unknown>; followUp: PatchInput } {
  const target = input.statusId ? ctx.statuses.find((s) => s.id === input.statusId) : undefined;
  const newFactory = factoryStatusFor(ctx.statuses, 'new');
  const closing = target?.category === 'solved';
  const stageId = target && !closing && target.id !== newFactory?.id ? target.id : undefined;
  const body = createTicketBody({
    subject: input.subject,
    requesterId: input.requesterId,
    markdown: input.markdown,
    teamId: input.teamId,
    priority: input.priority,
    assigneeId: input.assigneeId,
    stageId,
    tagIds: input.tags?.length ? resolveTagIds(input.tags, ctx.tags).ids : undefined,
    isPublic: input.public,
    type: input.type,
    formId: input.formId,
    fieldValues: input.fieldValues,
  });
  const followUp: PatchInput = {
    ...(closing ? { statusId: target!.id } : {}),
    ...(input.followerIds?.length ? { followerIds: input.followerIds } : {}),
    ...(input.ccIds?.length ? { ccIds: input.ccIds } : {}),
    ...(input.customFields && Object.keys(input.customFields).length ? { customFields: input.customFields } : {}),
  };
  return { body, followUp };
}

/** JSON -> multipart (o backend recebe anexos em `files`). */
export function toFormData(fields: Record<string, unknown>, files: File[] = []): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) fd.append(k, String(item)); // listas (tags) viajam repetidas, como o backend espera
      continue;
    }
    if (typeof v === 'object') {
      fd.append(k, JSON.stringify(v)); // `custom_fields`: o JSON em texto, como o backend espera no multipart
      continue;
    }
    fd.append(k, typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
  }
  for (const f of files) fd.append('files', f, f.name);
  return fd;
}

// ---------------------------------------------------------------------------------------------------------------
// Administração
// ---------------------------------------------------------------------------------------------------------------

/** Tokens de cor do Helpdesk -> hex que o backend guarda. */
const STATUS_TOKEN_HEX: Record<string, string> = { new: '#F5A04A', open: '#CC3340', hold: '#8F2A35', pending: '#1F73B7', solved: '#39434B' };
const HEX = /^#[0-9a-f]{6}$/i;

export function statusColorToHex(color: string): string {
  if (HEX.test(color)) return color;
  return STATUS_TOKEN_HEX[color] ?? '#888888';
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
