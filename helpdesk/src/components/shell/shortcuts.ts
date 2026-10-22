import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchUi } from './searchState';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
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
