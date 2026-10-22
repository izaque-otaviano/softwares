import { create } from 'zustand';
import { triggersApi } from '@/api';
import { IS_REAL } from '@/api/mode';
import { PartialUpdateError } from '@/api/errors';
import type { NewComment, NewTicketInput, TicketPatch } from '@/api/tickets';
import { openTicket, tabPath, goTo } from '@/components/shell/openTab';
import { interpolateMacro } from '@/lib/macroVars';
import { statusIdByCategory } from '@/lib/status';
import { runTriggers, type TriggerContext } from '@/lib/triggers';
import { getMeId } from '@/store/useSession';
import { useRefData } from '@/store/useRefData';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { toast } from '@/store/useUi';
import { localFieldsNote } from '@/store/useTickets';
import type { Macro, Priority, Ticket, TicketType } from '@/types/domain';

export type ReplyMode = 'public' | 'internal' | 'call';

export interface FormValues {
  subject: string;
  requesterId: string | null;
  assigneeGroupId: string;
  assigneeId: string | null;
  followerIds: string[];
  ccIds: string[];
  tags: string[];
  type: TicketType | null;
  priority: Priority | null;
  statusId: string;
  customFields: Record<string, string | undefined>;
}

export type FormErrorField = 'subject' | 'requester' | 'assignee' | 'comment';
export type FormErrors = Partial<Record<FormErrorField, string>>;

export interface FormEntry {
  key: string;
  isNew: boolean;
  /** `null` em ticket novo; preenchido depois do envio. */
  ticketId: number | null;
  values: FormValues;
  /** Valores do último estado salvo; `values !== original` => propriedades pendentes. */
  original: FormValues;
  replyMode: ReplyMode;
  /** Número digitado no modo Chamada. */
  callNumber: string;
  bodyHtml: string;
  /** Sobe a cada mudança de corpo vinda de fora do editor (macro, envio, reset): o Composer relê `bodyHtml`. */
  bodyRev: number;
  /** Anexos escolhidos no compositor (arquivos de verdade; o modo real os envia em multipart no envio). */
  files: File[];
  /** Macros usadas neste formulário e ainda não enviadas (o modo real chama `apply-macro` no envio). */
  macroIds: string[];
  ccOpen: boolean;
  /** Menu "Permanecer no ticket / Fechar aba". */
  stayOnTicket: boolean;
  submitting: boolean;
  errors: FormErrors;
  /** Falha de API do último envio: a UI mostra Banner "Tentar novamente" (`retry`); o texto digitado fica. */
  apiError: string | null;
}

export type SubmitResult =
  | { ok: true; ticketId: number; created: boolean; ticket: Ticket }
  | { ok: false; kind: 'validation' | 'api' | 'busy' | 'missing'; error: string };

interface FormState {
  forms: Record<string, FormEntry>;
  /** Cria o formulário da chave se ainda não existir (não sobrescreve edições pendentes). `ticket = null` = ticket novo. */
  init: (key: string, ticket: Ticket | null) => void;
  patch: (key: string, partial: Partial<FormValues>) => void;
  setReplyMode: (key: string, mode: ReplyMode) => void;
  setCallNumber: (key: string, value: string) => void;
  setBody: (key: string, html: string) => void;
  addFiles: (key: string, files: File[]) => void;
  removeFile: (key: string, index: number) => void;
  setCcOpen: (key: string, open: boolean) => void;
  setStayOnTicket: (key: string, stay: boolean) => void;
  /** Altera status/prioridade/tags e insere o texto no modo atual. Não envia. */
  applyMacro: (key: string, macro: Macro) => void;
  isDirty: (key: string) => boolean;
  /** Descarta propriedades pendentes e o texto do editor. */
  reset: (key: string) => void;
  /** Valida, salva, roda gatilhos, limpa o editor, avisa por toast e fecha/permanece. */
  submit: (key: string, statusIdOverride?: string) => Promise<SubmitResult>;
  /** Repete o último envio (Banner "Tentar novamente"). */
  retry: (key: string) => Promise<SubmitResult>;
  remove: (key: string) => void;
  clearErrors: (key: string) => void;
}

export const isNewKey = (key: string): boolean => key.startsWith('new-ticket:');
export const ticketIdFromKey = (key: string): number | null => (key.startsWith('ticket:') ? Number(key.slice(7)) : null);

const EMPTY_VALUES: FormValues = {
  subject: '',
  requesterId: null,
  assigneeGroupId: '',
  assigneeId: null,
  followerIds: [],
  ccIds: [],
  tags: [],
  type: null,
  priority: null,
  statusId: 'new',
  customFields: {},
};

export function valuesFromTicket(t: Ticket): FormValues {
  return {
    subject: t.subject,
    requesterId: t.requesterId,
    assigneeGroupId: t.assigneeGroupId,
    assigneeId: t.assigneeId ?? null,
    followerIds: [...t.followerIds],
    ccIds: [...t.ccIds],
    tags: [...t.tags],
    type: t.type ?? null,
    priority: t.priority ?? null,
    statusId: t.statusId,
    customFields: { ...t.customFields },
  };
}

const cleanFields = (f: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '')) as Record<string, string>;

const sameList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

function changedKeys(a: FormValues, b: FormValues): (keyof FormValues)[] {
  const out: (keyof FormValues)[] = [];
  (Object.keys(a) as (keyof FormValues)[]).forEach((k) => {
    const x = a[k];
    const y = b[k];
    const same =
      Array.isArray(x) && Array.isArray(y)
        ? sameList(x, y)
        : k === 'customFields'
          ? JSON.stringify(cleanFields(x as FormValues['customFields'])) === JSON.stringify(cleanFields(y as FormValues['customFields']))
          : x === y;
    if (!same) out.push(k);
  });
  return out;
}

/** Texto digitado no editor (imagem e tabela também contam). */
export function hasBodyContent(html: string): boolean {
  if (/<(img|hr|table)\b/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
}

export function computeDirty(e: FormEntry): boolean {
  return changedKeys(e.values, e.original).length > 0 || hasBodyContent(e.bodyHtml);
}

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Textos de macro podem ser HTML (mocks) ou texto simples. */
const textToHtml = (text: string): string =>
  /<[a-z][\s\S]*>/i.test(text)
    ? text
    : text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

function newEntry(key: string, ticket: Ticket | null, keep?: Partial<FormEntry>): FormEntry {
  const values = ticket ? valuesFromTicket(ticket) : { ...structuredClone(EMPTY_VALUES), statusId: statusIdByCategory(useTickets.getState().statuses, 'new') };
  return {
    key,
    isNew: ticket === null,
    ticketId: ticket?.id ?? null,
    values,
    original: structuredClone(values),
    replyMode: 'public',
    callNumber: '',
    bodyHtml: '',
    bodyRev: 0,
    files: [],
    macroIds: [],
    ccOpen: false,
    stayOnTicket: true,
    submitting: false,
    errors: {},
    apiError: null,
    ...keep,
  };
}

function validate(e: FormEntry): FormErrors {
  const errors: FormErrors = {};
  const { values } = e;
  const hasBody = hasBodyContent(e.bodyHtml);
  if (e.isNew) {
    if (!values.subject.trim()) errors.subject = 'Informe o assunto do ticket.';
    if (!values.requesterId) errors.requester = 'Selecione o solicitante.';
    if (!hasBody) errors.comment = 'Escreva a descrição do ticket.';
  }
  if (!values.assigneeGroupId && !values.assigneeId) errors.assignee = 'Atribua o ticket a um grupo ou agente.';
  if (!e.isNew && !hasBody && changedKeys(values, e.original).length === 0) {
    errors.comment = 'Escreva uma mensagem ou altere algum campo antes de enviar.';
  }
  if (e.replyMode === 'call' && !e.callNumber.trim()) errors.comment = 'Insira o número da chamada.';
  // O backend exige texto em toda mensagem (o anexo vai junto dela).
  if (IS_REAL && e.files.length > 0 && !hasBody) errors.comment = 'Escreva uma mensagem para acompanhar o anexo.';
  return errors;
}

function buildComment(e: FormEntry): NewComment | undefined {
  if (!hasBodyContent(e.bodyHtml)) return undefined;
  if (e.replyMode === 'call') {
    return { authorId: getMeId(), public: false, bodyHtml: `<p><strong>Chamada para ${escapeHtml(e.callNumber.trim())}</strong></p>${e.bodyHtml}`, files: e.files.length ? e.files : undefined };
  }
  return { authorId: getMeId(), public: e.replyMode === 'public', bodyHtml: e.bodyHtml, files: e.files.length ? e.files : undefined };
}

function diffPatch(e: FormEntry): TicketPatch {
  const keys = changedKeys(e.values, e.original);
  const v = e.values;
  const patch: TicketPatch = {};
  for (const k of keys) {
    switch (k) {
      case 'subject':
        patch.subject = v.subject;
        break;
      case 'requesterId':
        if (v.requesterId) patch.requesterId = v.requesterId;
        break;
      case 'assigneeGroupId':
        patch.assigneeGroupId = v.assigneeGroupId;
        break;
      case 'assigneeId':
        patch.assigneeId = v.assigneeId ?? undefined;
        break;
      case 'followerIds':
        patch.followerIds = v.followerIds;
        break;
      case 'ccIds':
        patch.ccIds = v.ccIds;
        break;
      case 'tags':
        patch.tags = v.tags;
        break;
      case 'type':
        patch.type = v.type ?? undefined;
        break;
      case 'priority':
        patch.priority = v.priority ?? undefined;
        break;
      case 'statusId':
        patch.statusId = v.statusId;
        break;
      case 'customFields':
        patch.customFields = v.customFields;
        break;
    }
  }
  return patch;
}

function triggerContext(ticket: Ticket, e: FormEntry, comment: NewComment | undefined, assigneeChanged: boolean): TriggerContext {
  const ref = useRefData.getState();
  return {
    ticket,
    isNew: e.isNew,
    comment: comment ? { public: comment.public, bodyHtml: comment.bodyHtml } : undefined,
    requester: ref.users.find((u) => u.id === ticket.requesterId),
    assignee: ticket.assigneeId ? ref.users.find((u) => u.id === ticket.assigneeId) : undefined,
    statuses: ref.statuses,
    groups: ref.groups,
    actorId: getMeId(),
    assigneeChanged,
  };
}

function closeAndNavigate(key: string): void {
  useTabs.getState().closeTab(key);
  const { tabs, activeTabId } = useTabs.getState();
  const next = tabs.find((t) => t.id === activeTabId);
  goTo(next ? tabPath(next) : '/agent/home');
}

/** Ticket novo vira ticket criado NA MESMA aba (mesma posição, sem reabrir). */
function convertTab(oldKey: string, ticket: Ticket): string {
  const newKey = `ticket:${ticket.id}`;
  const requester = useRefData.getState().users.find((u) => u.id === ticket.requesterId);
  useTabs.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === oldKey
        ? { ...t, id: newKey, kind: 'ticket' as const, refId: String(ticket.id), title: ticket.subject, subtitle: requester?.name, channel: ticket.channel, dirty: false }
        : t,
    ),
    activeTabId: s.activeTabId === oldKey ? newKey : s.activeTabId,
  }));
  return newKey;
}

export const useFormStore = create<FormState>()((set, get) => {
  const update = (key: string, fn: (e: FormEntry) => Partial<FormEntry>) => {
    const e = get().forms[key];
    if (!e) return;
    const next = { ...e, ...fn(e) };
    set((s) => ({ forms: { ...s.forms, [key]: next } }));
    useTabs.getState().setDirty(key, computeDirty(next));
  };

  const lastOverride = new Map<string, string | undefined>();

  /** Aplica na store/formulário o que o servidor JÁ gravou antes de uma falha no meio do envio. */
  const settlePartial = (key: string, snapshot: FormEntry, err: PartialUpdateError): string => {
    const t = err.ticket as Ticket;
    useTickets.getState().applyServerTicket(t);
    const pending = new Set(err.pendingKeys);
    const applied = err.appliedKeys.filter((k) => !pending.has(k));
    const server = valuesFromTicket(t);
    const patchOriginal: Partial<FormValues> = {};
    for (const k of applied) if (k in server) (patchOriginal as Record<string, unknown>)[k] = server[k as keyof FormValues];
    const macroIds = (get().forms[key]?.macroIds ?? snapshot.macroIds).filter((id) => !applied.includes(`macro:${id}`));
    const common: Partial<FormEntry> = {
      submitting: false,
      errors: {},
      apiError: err.message,
      macroIds,
      ...(err.commentSent ? { bodyHtml: '', bodyRev: snapshot.bodyRev + 1, callNumber: '', files: [] } : {}),
    };
    if (!err.created) {
      update(key, (x) => ({ ...common, original: { ...x.original, ...patchOriginal } }));
      return key;
    }
    // O ticket JÁ existe no backend: a aba passa a ser dele e "Tentar novamente" atualiza (não cria outro).
    const newKey = convertTab(key, t);
    set((s) => {
      const { [key]: old, ...rest } = s.forms;
      const base = old ?? snapshot;
      return { forms: { ...rest, [newKey]: { ...base, ...common, key: newKey, isNew: false, ticketId: t.id, original: { ...server, ...patchOriginal, statusId: applied.includes('statusId') ? server.statusId : server.statusId } } } };
    });
    useTabs.getState().setDirty(newKey, true);
    if (lastOverride.has(key)) lastOverride.set(newKey, lastOverride.get(key));
    goTo(`/agent/tickets/${t.id}`);
    return newKey;
  };

  const run = async (key: string, override: string | undefined): Promise<SubmitResult> => {
    let e = get().forms[key];
    if (!e) return { ok: false, kind: 'missing', error: 'Formulário não encontrado.' };
    if (e.submitting) return { ok: false, kind: 'busy', error: 'Envio em andamento.' };
    if (override) {
      update(key, (x) => ({ values: { ...x.values, statusId: override } }));
      e = get().forms[key]!;
    }
    const errors = validate(e);
    if (Object.keys(errors).length > 0) {
      update(key, () => ({ errors, apiError: null }));
      return { ok: false, kind: 'validation', error: Object.values(errors)[0] ?? 'Revise o formulário.' };
    }
    update(key, () => ({ submitting: true, errors: {}, apiError: null }));
    await useRefData.getState().refresh(); // grupos, usuários e gatilhos atuais (nunca lança)
    const snapshot = get().forms[key]!;
    const { values } = snapshot;
    const comment = buildComment(snapshot);
    const tickets = useTickets.getState();
    let saved: Ticket;
    let assigneeChanged = false;
    try {
      if (snapshot.isNew) {
        let assigneeId = values.assigneeId;
        const meId = getMeId();
        const group = useRefData.getState().groups.find((g) => g.id === values.assigneeGroupId);
        if (!assigneeId && group?.agentIds.includes(meId)) assigneeId = meId; // auto-atribui ao criador
        assigneeChanged = Boolean(assigneeId);
        const input: NewTicketInput = {
          subject: values.subject.trim(),
          requesterId: values.requesterId!,
          bodyHtml: comment!.bodyHtml,
          public: comment!.public,
          authorId: meId,
          assigneeGroupId: values.assigneeGroupId || undefined,
          assigneeId: assigneeId ?? undefined,
          statusId: values.statusId,
          priority: values.priority ?? undefined,
          type: values.type ?? undefined,
          tags: values.tags,
          ccIds: values.ccIds,
          followerIds: values.followerIds,
          customFields: values.customFields,
          files: comment!.files,
          macroIds: snapshot.macroIds,
        };
        saved = await tickets.createTicket(input, { silent: true });
      } else {
        const patch = diffPatch(snapshot);
        assigneeChanged = 'assigneeId' in patch && Boolean(patch.assigneeId);
        saved = await tickets.updateTicket(snapshot.ticketId!, patch, comment, { silent: true, macroIds: snapshot.macroIds });
      }
    } catch (err) {
      if (err instanceof PartialUpdateError && err.ticket) {
        settlePartial(key, snapshot, err);
        return { ok: false, kind: 'api', error: err.message };
      }
      const message = err instanceof Error ? err.message : 'Não foi possível enviar. Tente novamente.';
      update(key, () => ({ submitting: false, apiError: message }));
      return { ok: false, kind: 'api', error: message };
    }

    // Motor de gatilhos LOCAL (capabilities.triggers = 'local': o backend não tem gatilhos). Falha aqui nunca desfaz o envio.
    // No modo REAL ele fica DESLIGADO: rodaria no navegador e gravaria mudanças/eventos "simulados" sobre tickets reais
    // (que o servidor não conhece e somem ao recarregar). Os gatilhos continuam editáveis, só não disparam.
    let final = saved;
    if (!IS_REAL) {
      try {
        const result = runTriggers(useRefData.getState().triggers, triggerContext(saved, snapshot, comment, assigneeChanged));
        if (result.fired.length > 0) {
          await triggersApi.recordTriggerFires(result.fired);
          final = await tickets.applyAutomation(saved.id, result.patch, result.events);
        }
      } catch {
        /* mantém o ticket salvo */
      }
    }

    const created = snapshot.isNew;
    let finalKey = key;
    const cleared: Partial<FormEntry> = {
      isNew: false,
      ticketId: final.id,
      values: valuesFromTicket(final),
      original: valuesFromTicket(final),
      bodyHtml: '',
      bodyRev: snapshot.bodyRev + 1,
      files: [],
      macroIds: [],
      callNumber: '',
      submitting: false,
      errors: {},
      apiError: null,
    };
    if (created) {
      finalKey = convertTab(key, final);
      set((s) => {
        const { [key]: old, ...rest } = s.forms;
        return { forms: { ...rest, [finalKey]: { ...(old ?? snapshot), ...cleared, key: finalKey } } };
      });
    } else {
      update(key, () => cleared);
    }
    useTabs.getState().setDirty(finalKey, false);

    toast.success(`${created ? `Ticket #${final.id} foi criado` : `Ticket #${final.id} foi atualizado`}${localFieldsNote(final)}`, {
      action: { label: 'Ver ticket', onClick: () => openTicket(final.id) },
    });
    const stay = get().forms[finalKey]?.stayOnTicket ?? true;
    if (!stay) closeAndNavigate(finalKey);
    else if (created) goTo(`/agent/tickets/${final.id}`);
    return { ok: true, ticketId: final.id, created, ticket: final };
  };

  return {
    forms: {},

    init: (key, ticket) => {
      if (get().forms[key]) return;
      void useRefData.getState().ensure();
      set((s) => ({ forms: { ...s.forms, [key]: newEntry(key, ticket) } }));
    },

    patch: (key, partial) => {
      // Dados de referência ainda não carregados: reaplica o grupo da organização quando chegarem.
      if (partial.requesterId && !useRefData.getState().loaded) {
        void useRefData
          .getState()
          .ensure()
          .then(() => {
            const e = get().forms[key];
            if (!e || !e.isNew || e.values.requesterId !== partial.requesterId || e.values.assigneeGroupId !== e.original.assigneeGroupId) return;
            const ref = useRefData.getState();
            const user = ref.users.find((u) => u.id === partial.requesterId);
            const groupId = ref.orgs.find((o) => o.id === user?.orgId)?.groupId;
            if (groupId) update(key, (x) => ({ values: { ...x.values, assigneeGroupId: groupId }, errors: { ...x.errors, assignee: undefined } }));
          });
      }
      update(key, (e) => {
        const values = { ...e.values, ...partial };
        // Ticket novo: o grupo acompanha a organização do solicitante enquanto o agente não escolheu outro.
        if (e.isNew && partial.requesterId && partial.assigneeGroupId === undefined && e.values.assigneeGroupId === e.original.assigneeGroupId) {
          const ref = useRefData.getState();
          const user = ref.users.find((u) => u.id === partial.requesterId);
          const groupId = ref.orgs.find((o) => o.id === user?.orgId)?.groupId;
          if (groupId) values.assigneeGroupId = groupId;
        }
        const errors = { ...e.errors };
        if (partial.subject !== undefined) delete errors.subject;
        if (partial.requesterId !== undefined) delete errors.requester;
        if (partial.assigneeGroupId !== undefined || partial.assigneeId !== undefined || values.assigneeGroupId) delete errors.assignee;
        return { values, errors };
      });
    },

    setReplyMode: (key, replyMode) => update(key, (e) => ({ replyMode, errors: { ...e.errors, comment: undefined } })),
    setCallNumber: (key, callNumber) => update(key, () => ({ callNumber })),
    setBody: (key, bodyHtml) =>
      update(key, (e) => (e.errors.comment ? { bodyHtml, errors: { ...e.errors, comment: undefined } } : { bodyHtml })),
    addFiles: (key, files) => update(key, (e) => ({ files: [...e.files, ...files] })),
    removeFile: (key, index) => update(key, (e) => ({ files: e.files.filter((_, i) => i !== index) })),
    setCcOpen: (key, ccOpen) => update(key, () => ({ ccOpen })),
    setStayOnTicket: (key, stayOnTicket) => update(key, () => ({ stayOnTicket })),

    applyMacro: (key, macro) =>
      update(key, (e) => {
        const a = macro.actions;
        const values = { ...e.values };
        if (a.status) values.statusId = a.status;
        if (a.priority) values.priority = a.priority;
        if (a.addTags?.length) values.tags = [...new Set([...values.tags, ...a.addTags])];
        let replyMode = e.replyMode;
        let text: string | undefined;
        if (replyMode === 'internal') text = a.internalNote ?? undefined;
        else text = a.publicReply ?? undefined;
        if (!text) {
          // O modo atual não tem texto na macro: usa o que ela oferece (e acompanha o modo).
          if (a.publicReply && replyMode !== 'public') replyMode = 'public';
          else if (a.internalNote && replyMode !== 'internal') replyMode = 'internal';
          text = replyMode === 'internal' ? a.internalNote : a.publicReply;
        }
        if (text) {
          const ref = useRefData.getState();
          const requester = ref.users.find((u) => u.id === e.values.requesterId);
          const ticket = e.ticketId !== null ? useTickets.getState().tickets.find((t) => t.id === e.ticketId) : undefined;
          text = interpolateMacro(text, { requester: requester?.name ?? ticket?.requesterName, company: ref.orgs.find((o) => o.id === requester?.orgId)?.name ?? ticket?.companyName, reference: ticket?.reference });
        }
        const patch: Partial<FormEntry> = { values, replyMode, macroIds: [...new Set([...e.macroIds, macro.id])] };
        if (text) {
          patch.bodyHtml = hasBodyContent(e.bodyHtml) ? e.bodyHtml + textToHtml(text) : textToHtml(text);
          patch.bodyRev = e.bodyRev + 1;
        }
        return patch;
      }),

    isDirty: (key) => {
      const e = get().forms[key];
      return e ? computeDirty(e) : false;
    },

    reset: (key) =>
      update(key, (e) => ({ values: structuredClone(e.original), bodyHtml: '', bodyRev: e.bodyRev + 1, files: [], macroIds: [], callNumber: '', errors: {}, apiError: null })),

    submit: (key, statusIdOverride) => {
      lastOverride.set(key, statusIdOverride);
      return run(key, statusIdOverride);
    },

    retry: (key) => run(key, lastOverride.get(key)),

    remove: (key) => {
      lastOverride.delete(key);
      set((s) => {
        const { [key]: _gone, ...rest } = s.forms;
        return { forms: rest };
      });
    },

    clearErrors: (key) => update(key, () => ({ errors: {}, apiError: null })),
  };
});

/** Formulário da chave (ou `undefined` antes do `init`). */
export const useFormEntry = (key: string): FormEntry | undefined => useFormStore((s) => s.forms[key]);

/** Fecha a aba => descarta o formulário. */
useTabs.subscribe((state, prev) => {
  const open = new Set(state.tabs.map((t) => t.id));
  for (const t of prev.tabs) {
    if (!open.has(t.id) && useFormStore.getState().forms[t.id]) useFormStore.getState().remove(t.id);
  }
});
