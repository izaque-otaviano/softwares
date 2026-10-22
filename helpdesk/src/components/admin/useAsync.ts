import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

/** Carrega dados de uma função assíncrona (API mockada) com estados de carregando/erro e `reload` ("Tentar novamente"). */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: string | undefined }>({
    data: undefined,
    loading: true,
    error: undefined,
  });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    loadRef
      .current()
      .then((data) => alive && setState({ data, loading: false, error: undefined }))
      .catch((e: unknown) =>
        alive && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Não foi possível carregar.' })),
      );
    return () => {
      alive = false;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
