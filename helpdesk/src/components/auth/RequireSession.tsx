import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useSession } from '@/store/useSession';

/** Destino seguro depois do login: caminho interno, nunca `//host` nem o próprio /login. */
export function safeRedirect(target: unknown): string {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/login')) return '/agent/home';
  return target;
}

/**
 * Guard de rotas: confirma a sessão ao montar (/auth/me/) e redireciona para /login guardando o destino.
 * No modo mock a sessão já nasce autenticada e o guard apenas deixa passar.
 */
export function RequireSession({ children }: { children?: React.ReactNode }) {
  const status = useSession((s) => s.status);
  const location = useLocation();

  useEffect(() => {
    if (useSession.getState().status === 'loading') void useSession.getState().restore();
  }, []);

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Verificando sessão" className="flex h-screen items-center justify-center bg-surface text-fg-muted">
        <Spinner />
      </div>
    );
  }
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }
  return <>{children ?? <Outlet />}</>;
}
