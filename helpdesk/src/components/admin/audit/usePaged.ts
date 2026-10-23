import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageOf } from '@/types/admin-b';

export interface PagedState<T> {
  page: PageOf<T> | undefined;
  loading: boolean;
  error: string | undefined;
  offset: number;
  setOffset: (offset: number) => void;
  reload: () => void;
}

/**
 * Paginação do servidor: busca `limit/offset` a cada mudança de `offset` ou de `key` (os filtros serializados).
 * Mudar os filtros volta ao início. Guarda a página anterior enquanto carrega a próxima. Ignora respostas atrasadas.
 */
export function usePaged<T>(load: (offset: number) => Promise<PageOf<T>>, key: string, enabled = true): PagedState<T> {
  const [offset, setOffsetState] = useState(0);
  const [page, setPage] = useState<PageOf<T> | undefined>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const lastKey = useRef(key);

  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      if (offset !== 0) {
        setOffsetState(0);
        return undefined;
      }
    }
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setError(undefined);
    loadRef
      .current(offset)
      .then((p) => {
        if (!alive) return;
        setPage(p);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Não foi possível carregar.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [offset, key, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { page, loading, error, offset, setOffset: setOffsetState, reload };
}
