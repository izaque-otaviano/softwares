import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { useSearchUi } from './searchState';

/** Estado de abertura do diálogo de ajuda de atalhos (tecla "?"). */
export const useShortcutsHelp = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Foco em campo de texto, ou dentro de diálogo/menu/lista aberta: atalhos de uma tecla não valem. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  return target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !== null;
}

/** "?" abre a ajuda de atalhos. Funciona em qualquer tela (agente e administração). */
export function useHelpShortcut(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        useShortcutsHelp.getState().setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** Atalhos globais: `g` depois `h` (Início), `g` `v` (Views), `/` (busca). Ignorados quando o foco está em campo de texto. */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === '/') {
        e.preventDefault();
        useSearchUi.getState().setOpen(true);
        return;
      }
      if (pendingG && Date.now() - pendingG < 1500) {
        pendingG = 0;
        if (key === 'h') navigate('/agent/home');
        else if (key === 'v') navigate('/agent/views');
        else if (key === 'g') pendingG = Date.now();
        return;
      }
      pendingG = key === 'g' ? Date.now() : 0;
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);
}
