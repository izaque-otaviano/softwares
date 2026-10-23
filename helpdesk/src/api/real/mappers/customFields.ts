import { FIELD_TYPES, type FieldType, type FieldValue, type TicketField, type TicketForm, type TicketType } from '@/types/domain';
import type { FieldInput, FieldPatch, FormInput } from '@/types/customFields';
import type { TicketFieldDto, TicketFormDto } from './dto';

const TICKET_TYPES: ReadonlySet<string> = new Set(['question', 'incident', 'problem', 'task']);

/** Campo do backend -> `TicketField`. `id` é o numérico em texto; `slug` é a chave de `custom_fields`. */
export function mapField(d: TicketFieldDto): TicketField {
  const type: FieldType = (FIELD_TYPES as readonly string[]).includes(d.type) ? (d.type as FieldType) : 'text';
  return {
    id: String(d.id),
    slug: d.slug,
    title: d.title,
    type,
    system: false,
    active: d.is_active,
    required: d.is_required,
    description: d.description || undefined,
    options: type === 'dropdown' ? (d.options ?? []).map((o) => ({ value: String(o.value), label: String(o.label) })) : undefined,
    order: d.order,
    valuesCount: d.values_count,
    updatedAt: d.updated_at,
  };
}

export function mapForm(d: TicketFormDto): TicketForm {
  return {
    id: String(d.id),
    name: d.name,
    description: d.description ?? '',
    active: d.is_active,
    isDefault: d.is_default,
    order: d.order,
    defaultTeamId: d.default_team != null ? String(d.default_team) : undefined,
    defaultTeamName: d.default_team_name ?? undefined,
    defaultType: d.type && TICKET_TYPES.has(d.type) ? (d.type as TicketType) : undefined,
    ticketCount: d.ticket_count ?? 0,
    fields: [...(d.form_fields ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((i) => ({
        fieldId: String(i.field),
        slug: i.slug,
        title: i.title,
        type: ((FIELD_TYPES as readonly string[]).includes(i.type) ? i.type : 'text') as FieldType,
        fieldActive: i.field_is_active,
        required: i.is_required,
      })),
  };
}

/** `custom_fields` do detalhe -> valores por slug (sem nulos). Número que vier em texto vira número. */
export function mapFieldValues(raw: TicketDetailDtoValues | undefined | null): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (v !== null && v !== undefined && v !== '') out[k] = v;
  return out;
}
type TicketDetailDtoValues = Record<string, string | number | boolean | null>;

export function fieldBody(input: FieldInput | FieldPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title.trim();
  if (input.description !== undefined) out.description = input.description.trim();
  if ('type' in input && input.type !== undefined) out.type = input.type;
  if ('required' in input && input.required !== undefined) out.is_required = input.required;
  if ('active' in input && input.active !== undefined) out.is_active = input.active;
  if (input.options !== undefined) out.options = input.options.map((o) => ({ value: o.value, label: o.label }));
  return out;
}

export function formBody(input: Partial<FormInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name.trim();
  if (input.description !== undefined) out.description = input.description.trim();
  if (input.active !== undefined) out.is_active = input.active;
  if (input.isDefault !== undefined) out.is_default = input.isDefault;
  if (input.defaultTeamId !== undefined) out.default_team = input.defaultTeamId === null || input.defaultTeamId === '' ? null : Number(input.defaultTeamId);
  if (input.defaultType !== undefined) out.type = input.defaultType;
  if (input.fields !== undefined) out.form_fields = input.fields.map((f) => ({ field: f.field, is_required: f.required }));
  return out;
}
