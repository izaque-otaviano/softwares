import { factoryStatusFor, toBackendCategory } from './status';
import type { StageCategoryDto, TagDto, TicketDetailDto } from './dto';
import type { Priority, StatusCategory, TicketStatus } from '@/types/domain';

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
  customFields?: Record<string, string | undefined>;
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
export const LOCAL_ONLY_KEYS: readonly PatchKey[] = ['subject', 'requesterId', 'type', 'ccIds', 'customFields'];

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
  customFields: 'campos personalizados',
  comment: 'mensagem',
  macro: 'macro',
};

export const labelOf = (k: Covers): string => (k.startsWith('macro:') ? KEY_LABEL.macro : KEY_LABEL[k as PatchKey | 'comment']);

export type StepKind = 'macro' | 'props' | 'follow' | 'unfollow' | 'reply' | 'close' | 'stage';

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
}

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

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
 *  4. `stage` (bulk-status): refina para um status personalizado que o `reply` não alcança.
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
  if (covers.length > 0) steps.push({ kind: 'props', covers, body: props });

  // 2. seguir / deixar de seguir (só o próprio usuário; os demais seguidores só existem no navegador)
  if (patch.followerIds) {
    const wantsMe = patch.followerIds.includes(meId);
    const hasMe = current.followerIds.includes(meId);
    if (wantsMe && !hasMe) steps.push({ kind: 'follow', covers: ['followerIds'] });
    else if (!wantsMe && hasMe) steps.push({ kind: 'unfollow', covers: ['followerIds'] });
    const others = patch.followerIds.filter((id) => id !== meId);
    if (!sameSet(others, current.followerIds.filter((id) => id !== meId))) {
      local.followerIds = others;
      localKeys.push('followerIds');
    }
  }

  // 3 e 4. mensagem + status
  const cur = statuses.find((s) => s.id === current.statusId);
  const curCategory: StatusCategory = cur?.category ?? 'open';
  const explicit = patch.statusId !== undefined && patch.statusId !== current.statusId;
  const target = explicit ? statuses.find((s) => s.id === patch.statusId) : undefined;
  const hasMsg = Boolean(comment && comment.markdown.trim());

  const statusStep = (): PlanStep | 'blocked' | null => {
    if (!target) return null;
    if (target.category === 'solved') return curCategory === 'solved' ? null : { kind: 'close', covers: ['statusId'], needsWindow: true };
    if (curCategory === 'solved') return 'blocked';
    if (target.id === current.statusId) return null;
    return { kind: 'stage', covers: ['statusId'], body: { stage_id: Number(target.id) } };
  };

  if (hasMsg && comment!.public) {
    const category: StatusCategory = target ? target.category : curCategory === 'solved' ? 'open' : curCategory;
    const newStatus = replyStatusFor(category);
    const body: Record<string, unknown> = { body: comment!.markdown, is_public: true, new_status: newStatus, with_signature: false };
    const reply: PlanStep = { kind: 'reply', covers: ['comment', ...(explicit ? (['statusId'] as Covers[]) : [])], body, files: comment!.files, needsWindow: newStatus === 'closed' };
    steps.push(reply);
    if (target && target.category !== 'solved') {
      // Onde o backend vai cair com `new_status`: no mesmo stage (categoria igual) ou no stage de fábrica da categoria nova.
      const landing = curCategory === target.category ? (input.currentStageId ?? current.statusId) : factoryStatusFor(statuses, target.category)?.id;
      if (landing !== target.id) steps.push({ kind: 'stage', covers: ['statusId'], body: { stage_id: Number(target.id) } });
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
  files?: File[];
}

/** POST /tickets/: o backend só aceita equipe, assunto, corpo, prioridade e solicitante (o resto vem em chamadas seguintes). */
export function createTicketBody(i: CreateTicketInput): Record<string, unknown> {
  return {
    team_id: i.teamId,
    subject: i.subject.trim(),
    body: i.markdown,
    requester_id: Number(i.requesterId),
    ...(i.priority ? { priority: i.priority } : {}),
    with_signature: false,
  };
}

/** JSON -> multipart (o backend recebe anexos em `files`). */
export function toFormData(fields: Record<string, unknown>, files: File[] = []): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
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
