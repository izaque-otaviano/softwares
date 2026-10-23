import { ApiError } from '@/api/errors';
import type { FieldOption, FieldType, FieldValue, TicketField, TicketForm } from '@/types/domain';

/**
 * Regras puras dos campos personalizados e formulários de ticket (só equipe; o cliente nunca os vê).
 * O servidor é a fonte da verdade: estas funções só antecipam o que ele vai exigir (obrigatórios) e organizam a tela.
 */

export const FIELD_TYPE_LABEL: Record<FieldType | 'system', string> = {
  text: 'Texto',
  textarea: 'Parágrafo',
  number: 'Número',
  date: 'Data',
  checkbox: 'Caixa de seleção',
  dropdown: 'Lista suspensa',
  system: 'Sistema',
};

/** Tipos que o administrador pode criar, na ordem do seletor. */
export const CREATABLE_FIELD_TYPES: FieldType[] = ['text', 'textarea', 'number', 'date', 'checkbox', 'dropdown'];

/** Limite do backend: campos ATIVOS por conta. */
export const MAX_ACTIVE_FIELDS = 60;
export const TITLE_MAX = 80;
export const OPTION_MAX = 100;
export const OPTIONS_MAX = 200;
export const TEXT_MAX = 2000;
export const TEXTAREA_MAX = 10000;

/** Mesmas regras do servidor para a lista de opções do dropdown (ordenada; valor e rótulo únicos sem diferenciar caixa). `null` = válida. */
export function optionsError(options: FieldOption[] | undefined): string | null {
  const list = (options ?? []).filter((o) => o.label.trim());
  if (list.length === 0) return 'Informe ao menos uma opção para a lista.';
  if (list.length > OPTIONS_MAX) return `Use no máximo ${OPTIONS_MAX} opções.`;
  const values = new Set<string>();
  const labels = new Set<string>();
  for (const o of list) {
    const label = o.label.trim();
    const value = (o.value || label).trim();
    if (label.length > OPTION_MAX || value.length > OPTION_MAX) return `Cada opção aceita até ${OPTION_MAX} caracteres.`;
    if (values.has(value.toLowerCase()) || labels.has(label.toLowerCase())) return `Opção repetida: "${label}".`;
    values.add(value.toLowerCase());
    labels.add(label.toLowerCase());
  }
  return null;
}

export type FieldValues = Record<string, FieldValue>;

/** Vazio = ausente, `null`, `undefined` ou texto em branco. `false` e `0` contam como preenchidos. */
export const isFilled = (v: FieldValue | null | undefined): v is FieldValue => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

/** Remove os vazios (comparação e envio). */
export function cleanValues(values: Record<string, FieldValue | null | undefined> | undefined): FieldValues {
  const out: FieldValues = {};
  for (const [k, v] of Object.entries(values ?? {})) if (isFilled(v)) out[k] = v;
  return out;
}

export function sameValues(a: Record<string, FieldValue | null | undefined> | undefined, b: Record<string, FieldValue | null | undefined> | undefined): boolean {
  const x = cleanValues(a);
  const y = cleanValues(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if (x[k] !== y[k]) return false;
  return true;
}

/**
 * O que mudou de `before` para `after` no formato do `PATCH custom_fields`: valor novo, ou `null` para apagar.
 * Chave que não mudou não vai (ausente não mexe no servidor).
 */
export function diffValues(before: FieldValues | undefined, after: FieldValues | undefined): Record<string, FieldValue | null> {
  const a = cleanValues(before);
  const b = cleanValues(after);
  const out: Record<string, FieldValue | null> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) out[k] = k in b ? b[k]! : null;
  return out;
}

/** Formulário que vale para o ticket: o dele; senão o padrão; senão o primeiro ativo. */
export function formForTicket(formId: string | undefined, forms: TicketForm[]): TicketForm | undefined {
  return (formId ? forms.find((f) => f.id === formId) : undefined) ?? forms.find((f) => f.isDefault) ?? forms.find((f) => f.active);
}

export interface FieldSlot {
  field: TicketField;
  /** Obrigatório (no campo ou neste formulário). */
  required: boolean;
  /** Campo desativado que ainda tem valor no ticket: aparece só para leitura. */
  readOnly: boolean;
}

const keyOf = (f: TicketField): string => f.slug ?? f.id;

/**
 * Campos do formulário, na ordem dele. Campo ativo vira controle; campo desativado só aparece (somente leitura) se o
 * ticket tem valor; campo desativado sem valor some.
 */
export function slotsFor(form: TicketForm | undefined, fields: TicketField[], values: FieldValues | undefined): FieldSlot[] {
  if (!form) return [];
  const bySlug = new Map(fields.filter((f) => !f.system).map((f) => [keyOf(f), f]));
  const out: FieldSlot[] = [];
  for (const item of form.fields) {
    const field = bySlug.get(item.slug);
    if (!field) continue;
    if (!field.active) {
      if (isFilled(values?.[keyOf(field)])) out.push({ field, required: false, readOnly: true });
      continue;
    }
    out.push({ field, required: field.required || item.required, readOnly: false });
  }
  return out;
}

/** Campos obrigatórios ainda vazios (o mesmo critério do backend: ativo, no formulário, obrigatório, sem valor). */
export function missingRequired(slots: FieldSlot[], values: FieldValues | undefined): FieldSlot[] {
  return slots.filter((s) => s.required && !s.readOnly && !isFilled(values?.[keyOf(s.field)]));
}

export const fieldKey = keyOf;

/** Texto legível de um valor (somente leitura, eventos). */
export function formatFieldValue(field: Pick<TicketField, 'type' | 'options'>, value: FieldValue | undefined): string {
  if (!isFilled(value)) return '—';
  if (field.type === 'checkbox') return value ? 'Sim' : 'Não';
  if (field.type === 'dropdown') return field.options?.find((o) => o.value === value)?.label ?? String(value);
  if (field.type === 'date' && typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
  }
  if (field.type === 'number' && typeof value === 'number') return value.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
  return String(value);
}

/** Número digitado (aceita vírgula) -> número; vazio -> `null`; inválido -> `undefined`. Até 9 inteiros e 6 decimais, como o servidor. */
export function parseNumberInput(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  const [int = '', dec = ''] = t.replace('-', '').split('.');
  if (int.length > 9 || dec.length > 6) return undefined;
  return Number(t);
}

export const NUMBER_HINT = 'Até 9 dígitos inteiros e 6 decimais.';

// ---------------------------------------------------------------------------------------------------------------
// Erros do servidor
// ---------------------------------------------------------------------------------------------------------------

export interface MissingField {
  id?: string;
  slug: string;
  title: string;
}

export const REQUIRED_CODE = 'required_custom_fields';

/** `400 required_custom_fields` (criar, resolver/fechar): os campos que faltam; `null` se o erro é outro. */
export function requiredFromError(e: unknown): MissingField[] | null {
  if (!(e instanceof ApiError) || e.code !== REQUIRED_CODE) return null;
  const body = e.body as { fields?: { id?: number; slug?: string; title?: string }[]; custom_fields?: Record<string, string> } | undefined;
  const list = (body?.fields ?? []).filter((f) => f && f.slug).map((f) => ({ id: f.id != null ? String(f.id) : undefined, slug: f.slug!, title: f.title ?? f.slug! }));
  if (list.length > 0) return list;
  return Object.keys(body?.custom_fields ?? {}).map((slug) => ({ slug, title: slug }));
}

/** Erros por campo do `400` (`{custom_fields: {slug: mensagem}}`); vazio se não houver. */
export function customFieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError)) return {};
  const cf = (e.body as { custom_fields?: unknown } | undefined)?.custom_fields;
  if (!cf || typeof cf !== 'object' || Array.isArray(cf)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cf as Record<string, unknown>)) out[k] = Array.isArray(v) ? String(v[0] ?? '') : String(v);
  return out;
}

/**
 * Nomes dos campos pendentes no `detail` de um item de `failed[]` do `bulk-close`
 * ("Preencha os campos obrigatórios antes de resolver ou fechar o ticket: A, B."). `null` se não é esse motivo.
 */
export function namesFromRequiredDetail(detail: string): string[] | null {
  if (!/campos obrigat[oó]rios/i.test(detail)) return null;
  const i = detail.lastIndexOf(':');
  if (i < 0) return [];
  return detail
    .slice(i + 1)
    .replace(/\.\s*$/, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Erro `required_custom_fields` do mock (mesmo corpo do servidor). */
export function requiredError(missing: MissingField[], action: 'criar' | 'resolver ou fechar'): ApiError {
  const names = missing.map((m) => m.title).join(', ');
  return new ApiError(`Preencha os campos obrigatórios antes de ${action} o ticket: ${names}.`, {
    status: 400,
    code: REQUIRED_CODE,
    body: {
      detail: `Preencha os campos obrigatórios antes de ${action} o ticket: ${names}.`,
      code: REQUIRED_CODE,
      fields: missing.map((m) => ({ id: m.id ? Number(m.id) : undefined, slug: m.slug, title: m.title })),
      custom_fields: Object.fromEntries(missing.map((m) => [m.slug, 'Campo obrigatório.'])),
    },
  });
}
