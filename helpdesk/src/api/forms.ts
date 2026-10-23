import * as mock from './mock/forms';
import * as real from './real/forms';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const { listForms, createForm, updateForm, deleteForm, reorderForms, cloneForm } = impl;
