import type { FieldOption, TicketField } from '@/types/domain';
import type { FieldInput, FieldPatch } from '@/types/customFields';
import { MAX_ACTIVE_FIELDS, TITLE_MAX, optionsError } from '@/lib/customFields';
import { ApiError } from '../errors';
import { simulate } from './delay';
import { db } from './db';

const withCounts = (f: TicketField): TicketField => ({ ...f, valuesCount: db.tickets.filter((t) => t.fieldValues && f.slug! in t.fieldValues).length });
const sorted = (list: TicketField[]): TicketField[] => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** Só os campos personalizados (os padrão do front vêm de `lib/systemFields.ts`). */
export function listFields(): Promise<TicketField[]> {
  return simulate(() => sorted(db.fields).map(withCounts));
}

const slugOf = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const invalid = (field: string, message: string) => new ApiError(message, { status: 400, fieldErrors: { [field]: [message] }, body: { [field]: [message] } });

function validateOptions(options: FieldOption[] | undefined): FieldOption[] {
  const error = optionsError(options);
  if (error) throw invalid('options', error);
  return (options ?? []).filter((o) => o.label.trim()).map((o) => ({ value: (o.value || o.label).trim(), label: o.label.trim() }));
}

const checkTitle = (title: string): string => {
  const t = title.trim();
  if (!t) throw invalid('title', 'Informe o título.');
  if (t.length > TITLE_MAX) throw invalid('title', `Use no máximo ${TITLE_MAX} caracteres.`);
  return t;
};

const activeCount = () => db.fields.filter((f) => f.active).length;
const limitError = () => invalid('is_active', `Já existem ${MAX_ACTIVE_FIELDS} campos ativos. Desative algum antes de ativar ou criar outro.`);

export function createField(input: FieldInput): Promise<TicketField> {
  return simulate(() => {
    const title = checkTitle(input.title);
    const options = input.type === 'dropdown' ? validateOptions(input.options) : undefined;
    if (activeCount() >= MAX_ACTIVE_FIELDS) throw limitError();
    const base = slugOf(title).replace(/^\d+$/, (d) => `campo_${d}`) || 'campo';
    let slug = base;
    for (let n = 2; db.fields.some((f) => f.slug === slug); n += 1) slug = `${base}_${n}`;
    const field: TicketField = {
      id: slug,
      slug,
      title,
      type: input.type,
      system: false,
      active: true,
      required: input.required ?? false,
      description: input.description?.trim() ?? '',
      options,
      order: db.fields.reduce((m, f) => Math.max(m, f.order ?? 0), -1) + 1,
      valuesCount: 0,
      updatedAt: new Date().toISOString(),
    };
    db.fields = [...db.fields, field];
    return field;
  });
}

export function updateField(id: string, patch: FieldPatch): Promise<TicketField> {
  return simulate(() => {
    const cur = db.fields.find((f) => f.id === id);
    if (!cur) throw new ApiError('Campo não encontrado.', { status: 404 });
    const type = patch.type ?? cur.type;
    if (patch.type && patch.type !== cur.type && withCounts(cur).valuesCount) {
      throw invalid('type', 'Este campo já tem valores em tickets: o tipo não pode mudar. Crie um campo novo e desative este.');
    }
    const next: TicketField = { ...cur, type, updatedAt: new Date().toISOString() };
    if (patch.title !== undefined) next.title = checkTitle(patch.title);
    if (patch.description !== undefined) next.description = patch.description.trim();
    if (patch.required !== undefined) next.required = patch.required;
    next.options = type === 'dropdown' ? validateOptions(patch.options ?? cur.options) : undefined;
    if (patch.active !== undefined && patch.active !== cur.active) {
      if (patch.active && activeCount() >= MAX_ACTIVE_FIELDS) throw limitError();
      next.active = patch.active;
    }
    db.fields = db.fields.map((f) => (f.id === id ? next : f));
    return withCounts(next);
  });
}

export const setFieldActive = (id: string, active: boolean): Promise<TicketField> => updateField(id, { active });

export function deleteField(id: string): Promise<void> {
  return simulate(() => {
    const f = db.fields.find((x) => x.id === id);
    if (!f) throw new ApiError('Campo não encontrado.', { status: 404 });
    if (withCounts(f).valuesCount) {
      throw new ApiError('Este campo já foi usado em tickets e não pode ser apagado. Desative-o para escondê-lo.', { status: 409, code: 'field_in_use', body: { code: 'field_in_use' } });
    }
    db.fields = db.fields.filter((x) => x.id !== id);
    db.forms = db.forms.map((form) => ({ ...form, fields: form.fields.filter((i) => i.fieldId !== id) }));
  });
}

/** Os `ids` ganham as primeiras posições; os omitidos vão para o fim, na ordem em que estavam. */
export function reorderFields(ids: string[]): Promise<TicketField[]> {
  return simulate(() => {
    const rest = sorted(db.fields).filter((f) => !ids.includes(f.id));
    const first = ids.flatMap((id) => db.fields.filter((f) => f.id === id));
    db.fields = [...first, ...rest].map((f, i) => ({ ...f, order: i }));
    return sorted(db.fields).map(withCounts);
  });
}
