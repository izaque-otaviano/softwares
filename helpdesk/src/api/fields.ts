import * as mock from './mock/fields';
import * as real from './real/fields';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const { listFields, createField, updateField, setFieldActive, deleteField, reorderFields } = impl;
export type { FieldInput, FieldPatch } from '@/types/customFields';
