import type { TicketField } from '@/types/domain';
import { ApiError, simulate } from './delay';
import { db } from './db';

export function listFields(): Promise<TicketField[]> {
  return simulate(() => db.fields);
}

export type FieldInput = Pick<TicketField, 'title' | 'type'> & Partial<Pick<TicketField, 'description' | 'required' | 'options'>>;

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export function createField(input: FieldInput): Promise<TicketField> {
  return simulate(() => {
    const base = slug(input.title) || 'campo';
    let id = base;
    for (let n = 2; db.fields.some((f) => f.id === id); n += 1) id = `${base}_${n}`;
    const field: TicketField = {
      id,
      title: input.title.trim(),
      type: input.type,
      system: false,
      active: true,
      required: input.required ?? false,
      description: input.description,
      options: input.options,
      updatedAt: new Date().toISOString(),
    };
    db.fields = [...db.fields, field];
    return field;
  });
}

export function updateField(id: string, patch: Partial<Pick<TicketField, 'title' | 'description' | 'required' | 'options'>>): Promise<TicketField> {
  return simulate(() => {
    const i = db.fields.findIndex((f) => f.id === id);
    if (i < 0) throw new ApiError('Campo não encontrado.');
    const next = { ...db.fields[i]!, ...patch, updatedAt: new Date().toISOString() };
    db.fields = db.fields.map((f, j) => (j === i ? next : f));
    return next;
  });
}

export function setFieldActive(id: string, active: boolean): Promise<TicketField> {
  return simulate(() => {
    const f = db.fields.find((x) => x.id === id);
    if (!f) throw new ApiError('Campo não encontrado.');
    if (f.system) throw new ApiError('Campos padrão não podem ser desativados.');
    const next = { ...f, active, updatedAt: new Date().toISOString() };
    db.fields = db.fields.map((x) => (x.id === id ? next : x));
    return next;
  });
}

export function deleteField(id: string): Promise<void> {
  return simulate(() => {
    const f = db.fields.find((x) => x.id === id);
    if (!f) throw new ApiError('Campo não encontrado.');
    if (f.system) throw new ApiError('Campos padrão não podem ser apagados.');
    db.fields = db.fields.filter((x) => x.id !== id);
  });
}
