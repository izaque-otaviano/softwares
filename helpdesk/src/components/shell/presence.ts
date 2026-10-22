import { create } from 'zustand';
import type { Presence } from '@/components/ui';

/** Presença do agente logado (somente em memória). */
export const useAgentPresence = create<{ presence: Presence; setPresence: (p: Presence) => void }>()((set) => ({
  presence: 'available',
  setPresence: (presence) => set({ presence }),
}));
