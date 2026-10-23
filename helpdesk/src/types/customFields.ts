import type { FieldOption, FieldType, TicketType } from './domain';

/** Entrada de um campo novo (`POST /settings/ticket-fields/`). */
export interface FieldInput {
  title: string;
  type: FieldType;
  description?: string;
  required?: boolean;
  /** Só dropdown, em ordem. */
  options?: FieldOption[];
}

/** Edição de um campo (`PATCH`): o que não vem não muda. O tipo só muda enquanto nenhum ticket tem valor. */
export interface FieldPatch {
  title?: string;
  description?: string;
  required?: boolean;
  options?: FieldOption[];
  type?: FieldType;
  active?: boolean;
}

/** Campo dentro do formulário que se grava: a ordem da lista é a ordem de exibição. */
export interface FormFieldInput {
  /** Slug (ou id) do campo. */
  field: string;
  required: boolean;
}

export interface FormInput {
  name: string;
  description?: string;
  active?: boolean;
  isDefault?: boolean;
  defaultTeamId?: string | null;
  defaultType?: TicketType | null;
  fields?: FormFieldInput[];
}
export type FormPatch = Partial<FormInput>;
