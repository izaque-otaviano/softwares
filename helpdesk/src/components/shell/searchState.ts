import { create } from 'zustand';

/** Estado de abertura da busca global (o atalho "/" e o botão da TopBar usam o mesmo). */
export const useSearchUi = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
