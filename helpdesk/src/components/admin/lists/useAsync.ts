import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (next: T | ((prev: T | null) => T)) => void;
}

/** Carrega uma vez ao montar (e a cada `reload`). Guarda o último resultado bom enquanto recarrega. */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadRef
      .current()
      .then((d) => {
        if (!alive) return;
        setData(d);
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
  }, [tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, loading, error, reload, setData: (next) => setData((prev) => (typeof next === 'function' ? (next as (p: T | null) => T)(prev) : next)) };
}
