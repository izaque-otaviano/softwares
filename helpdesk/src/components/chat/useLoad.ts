import { useCallback, useEffect, useRef, useState } from 'react';

export interface LoadState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

/**
 * Carrega dados ao mudar `key` (descarta respostas antigas) e oferece `reload` para o "Tentar novamente".
 * `key = null` não carrega nada.
 */
export function useLoad<T>(key: string | null, load: () => Promise<T>): LoadState<T> {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: string | undefined }>({ data: undefined, loading: key !== null, error: undefined });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (key === null) {
      setState({ data: undefined, loading: false, error: undefined });
      return;
    }
    let alive = true;
    setState((s) => ({ data: s.data, loading: true, error: undefined }));
    loadRef
      .current()
      .then((data) => alive && setState({ data, loading: false, error: undefined }))
      .catch((e: unknown) => alive && setState({ data: undefined, loading: false, error: e instanceof Error ? e.message : 'Não foi possível carregar.' }));
    return () => {
      alive = false;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
