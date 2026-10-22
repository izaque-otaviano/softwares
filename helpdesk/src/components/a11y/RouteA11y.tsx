import { useEffect, useState } from 'react';
import { router } from '@/app/router';
import { routeLabel, routeTitle } from './routeTitle';

/**
 * Atualiza `document.title` a cada navegação e anuncia a nova página para leitores de tela (região `aria-live`).
 * Assina o roteador direto, então vive fora do `RouterProvider`.
 */
export function RouteA11y() {
  const [anuncio, setAnuncio] = useState('');

  useEffect(() => {
    let ultimo = '';
    const aplicar = () => {
      const { pathname, search } = router.state.location;
      document.title = routeTitle(pathname, search);
      if (pathname !== ultimo) {
        const primeira = ultimo === '';
        ultimo = pathname;
        if (!primeira) {
          setAnuncio(`Página: ${routeLabel(pathname, search)}`);
          // Se a navegação desmontou o elemento focado (fechar aba, descartar), o foco cairia no <body>: leva-o ao conteúdo.
          window.setTimeout(() => {
            const ativo = document.activeElement;
            if (ativo && ativo !== document.body && ativo.isConnected) return;
            document.getElementById('conteudo')?.focus({ preventScroll: true });
          }, 50);
        }
      }
    };
    aplicar();
    return router.subscribe(aplicar);
  }, []);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {anuncio}
    </div>
  );
}
