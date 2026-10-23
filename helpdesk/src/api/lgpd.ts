import * as mock from './mock/lgpd';
import * as real from './real/lgpd';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: typeof mock = IS_REAL ? real : mock;

export const { listRequests, getRequest, createRequest, listRedactionCandidates, verifyRequest, rejectRequest, executeRequest, redactField, downloadDossier } = impl;
