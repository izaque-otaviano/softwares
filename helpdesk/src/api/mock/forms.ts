import type { FormFieldItem, TicketForm } from '@/types/domain';
import type { FormInput, FormPatch } from '@/types/customFields';
import { ApiError } from '../errors';
import { simulate } from './delay';
import { db } from './db';

const invalid = (field: string, message: string) => new ApiError(message, { status: 400, fieldErrors: { [field]: [message] }, body: { [field]: [message] } });
const conflict = (message: string, code: string) => new ApiError(message, { status: 409, code, body: { detail: message, code } });

const sorted = (list: TicketForm[]): TicketForm[] => [...list].sort((a, b) => a.order - b.order);
const withCount = (f: TicketForm): TicketForm => ({ ...f, ticketCount: db.tickets.filter((t) => t.formId === f.id).length });
const teamName = (id?: string | null): string | undefined => (id ? db.groups.find((g) => g.id === id)?.name : undefined);

export function listForms(): Promise<TicketForm[]> {
  return simulate(() => sorted(db.forms).map(withCount));
}

/** Itens do corpo -> itens do formulário (mesmas validações do servidor). */
function buildItems(input: NonNullable<FormInput['fields']>, current: FormFieldItem[] = []): FormFieldItem[] {
  const out: FormFieldItem[] = [];
  const errors: string[] = [];
  input.forEach((it, i) => {
    const n = i + 1;
    const f = db.fields.find((x) => x.slug === it.field || x.id === it.field);
    if (!f) return void errors.push(`Item ${n}: campo "${it.field}" não existe.`);
    if (out.some((o) => o.fieldId === f.id)) return void errors.push(`Item ${n}: campo "${f.title}" repetido.`);
    if (!f.active && !current.some((c) => c.fieldId === f.id)) return void errors.push(`Item ${n}: campo "${f.title}" está desativado.`);
    out.push({ fieldId: f.id, slug: f.slug!, title: f.title, type: f.type as FormFieldItem['type'], fieldActive: f.active, required: it.required });
  });
  if (errors.length) throw new ApiError(errors[0]!, { status: 400, fieldErrors: { form_fields: errors }, body: { form_fields: errors } });
  return out;
}

function checkName(name: string, exceptId?: string): string {
  const n = name.trim();
  if (!n) throw invalid('name', 'Informe o nome.');
  if (n.length > 80) throw invalid('name', 'Use no máximo 80 caracteres.');
  if (db.forms.some((f) => f.id !== exceptId && f.name.toLowerCase() === n.toLowerCase())) throw invalid('name', 'Já existe um formulário com este nome.');
  return n;
}

const nextId = () => String(db.forms.reduce((m, f) => Math.max(m, Number(f.id) || 0), 0) + 1);

export function createForm(input: FormInput): Promise<TicketForm> {
  return simulate(() => {
    const name = checkName(input.name);
    const active = input.active ?? true;
    const hasDefault = db.forms.some((f) => f.isDefault);
    const isDefault = Boolean(input.isDefault) || !hasDefault;
    if (isDefault && !active) throw invalid('is_default', 'O formulário padrão precisa estar ativo.');
    const form: TicketForm = {
      id: nextId(),
      name,
      description: input.description?.trim() ?? '',
      active,
      isDefault,
      order: db.forms.reduce((m, f) => Math.max(m, f.order), -1) + 1,
      defaultTeamId: input.defaultTeamId ?? undefined,
      defaultTeamName: teamName(input.defaultTeamId),
      defaultType: input.defaultType ?? undefined,
      ticketCount: 0,
      fields: input.fields ? buildItems(input.fields) : [],
    };
    db.forms = [...db.forms.map((f) => (isDefault ? { ...f, isDefault: false } : f)), form];
    return form;
  });
}

export function updateForm(id: string, patch: FormPatch): Promise<TicketForm> {
  return simulate(() => {
    const cur = db.forms.find((f) => f.id === id);
    if (!cur) throw new ApiError('Formulário não encontrado.', { status: 404 });
    const name = patch.name !== undefined ? checkName(patch.name, id) : cur.name;
    const active = patch.active ?? cur.active;
    if (patch.isDefault && !active) throw invalid('is_default', 'O formulário padrão precisa estar ativo.');
    if (cur.isDefault && patch.isDefault === false) throw conflict('Este é o formulário padrão. Escolha outro formulário como padrão antes de tirar este.', 'default_form_required');
    if (cur.isDefault && patch.active === false) throw conflict('Este é o formulário padrão e não pode ser desativado. Escolha outro formulário como padrão antes.', 'default_form_required');
    const team = patch.defaultTeamId !== undefined ? (patch.defaultTeamId ?? undefined) : cur.defaultTeamId;
    const next: TicketForm = {
      ...cur,
      name,
      description: patch.description !== undefined ? patch.description.trim() : cur.description,
      active,
      isDefault: patch.isDefault ?? cur.isDefault,
      defaultTeamId: team,
      defaultTeamName: teamName(team),
      defaultType: patch.defaultType !== undefined ? (patch.defaultType ?? undefined) : cur.defaultType,
      fields: patch.fields ? buildItems(patch.fields, cur.fields) : cur.fields,
    };
    db.forms = db.forms.map((f) => (f.id === id ? next : next.isDefault ? { ...f, isDefault: false } : f));
    return withCount(next);
  });
}

export function deleteForm(id: string): Promise<void> {
  return simulate(() => {
    const f = db.forms.find((x) => x.id === id);
    if (!f) throw new ApiError('Formulário não encontrado.', { status: 404 });
    if (f.isDefault) throw conflict('Este é o formulário padrão e não pode ser apagado. Escolha outro formulário como padrão antes.', 'default_form_required');
    if (withCount(f).ticketCount > 0) throw conflict('Há tickets usando este formulário. Desative-o em vez de apagar.', 'form_in_use');
    db.forms = db.forms.filter((x) => x.id !== id);
  });
}

export function reorderForms(ids: string[]): Promise<TicketForm[]> {
  return simulate(() => {
    const rest = sorted(db.forms).filter((f) => !ids.includes(f.id));
    const first = ids.flatMap((id) => db.forms.filter((f) => f.id === id));
    db.forms = [...first, ...rest].map((f, i) => ({ ...f, order: i }));
    return sorted(db.forms).map(withCount);
  });
}

/** Cópia (campos, obrigatoriedade, equipe e tipo padrão); nunca vira o padrão. Sem nome: "Cópia de X". */
export function cloneForm(id: string, name?: string): Promise<TicketForm> {
  return simulate(() => {
    const src = db.forms.find((f) => f.id === id);
    if (!src) throw new ApiError('Formulário não encontrado.', { status: 404 });
    let final: string;
    if (name !== undefined) final = checkName(name);
    else {
      const base = `Cópia de ${src.name}`.slice(0, 70);
      final = base;
      for (let n = 2; db.forms.some((f) => f.name.toLowerCase() === final.toLowerCase()); n += 1) final = `${base} (${n})`;
    }
    const copy: TicketForm = { ...structuredClone(src), id: nextId(), name: final, isDefault: false, active: true, order: db.forms.reduce((m, f) => Math.max(m, f.order), 0) + 1, ticketCount: 0 };
    db.forms = [...db.forms, copy];
    return copy;
  });
}
