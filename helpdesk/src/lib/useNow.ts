import { useEffect, useState } from 'react';

/**
 * Relógio reativo: devolve a data atual e a renova a cada `intervalMs` (padrão 30 s).
 * - `intervalMs <= 0` (ou não finito) não cria timer: o valor fica fixo até o intervalo mudar.
 * - O intervalo é limpo no unmount e renovado quando a aba volta a ficar visível (timers em segundo plano são atrasados).
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    const refresh = () => setNow(new Date());
    // Ao (re)ativar o relógio o valor pode estar velho; só renova se passou mais de 1 s (evita render extra no mount).
    setNow((prev) => (Date.now() - prev.getTime() > 1_000 ? new Date() : prev));

    const id = setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}
