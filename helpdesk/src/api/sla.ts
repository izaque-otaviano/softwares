import type { RefOption, SlaPolicy, SlaPolicyInput } from '@/types/admin-a';
import { sla as mock } from './mock/adminA';
import { IS_REAL } from './mode';
import * as real from './real/sla';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
export const listSlaPolicies = (): Promise<SlaPolicy[]> => (IS_REAL ? real.listSlaPolicies() : mock.list());
export const saveSlaPolicy = (input: SlaPolicyInput): Promise<SlaPolicy> => (IS_REAL ? real.saveSlaPolicy(input) : mock.save(input));
export const deleteSlaPolicy = (id: string): Promise<void> => (IS_REAL ? real.deleteSlaPolicy(id) : mock.remove(id));
export const getSlaRefs = (): Promise<{ plans: RefOption[]; teams: RefOption[]; defaultCalendar: string | null }> => (IS_REAL ? real.getSlaRefs() : mock.refs());
