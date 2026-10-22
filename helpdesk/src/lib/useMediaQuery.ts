import { useEffect, useState } from 'react';

function match(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
}

/** Reage a uma media query CSS. Em ambientes sem `matchMedia` (testes) devolve `false`. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => match(query));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

/** Abaixo de 1024 px: painel direito vira Drawer e propriedades viram acordeão. */
export const NARROW_QUERY = '(max-width: 1023.98px)';
export function useIsNarrow(): boolean {
  return useMediaQuery(NARROW_QUERY);
}
