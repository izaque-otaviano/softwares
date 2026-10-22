import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/api/session';
import Login from '@/pages/Login';
import { useSession } from '@/store/useSession';
import { RequireSession, safeRedirect } from './RequireSession';

const USER: SessionUser = { id: '7', name: 'Ana', email: 'a@b.c', role: 'agent', teams: [], permissions: [] };

function Where() {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/agent/*"
          element={
            <RequireSession>
              <h1>Área do agente</h1>
              <Where />
            </RequireSession>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const base = { twoFactor: null, error: null, expired: false } as const;

beforeEach(() => {
  useSession.setState({ status: 'anonymous', user: null, ...base });
});

describe('safeRedirect', () => {
  it('aceita só caminhos internos', () => {
    expect(safeRedirect('/agent/tickets/3?x=1')).toBe('/agent/tickets/3?x=1');
    for (const bad of ['//evil.com', 'https://evil.com', '/login', '/login?x', undefined, 5]) expect(safeRedirect(bad)).toBe('/agent/home');
  });
});

describe('RequireSession', () => {
  it('autenticado: renderiza a rota', () => {
    useSession.setState({ status: 'authenticated', user: USER });
    renderAt('/agent/home');
    expect(screen.getByRole('heading', { name: 'Área do agente' })).toBeInTheDocument();
  });

  it('anônimo: vai ao /login; depois do login volta ao destino original', async () => {
    const login = vi.fn(async () => {
      useSession.setState({ status: 'authenticated', user: USER });
      return 'ok' as const;
    });
    useSession.setState({ login });
    renderAt('/agent/tickets/42?aba=1');
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), 'a@b.c');
    await user.type(screen.getByLabelText(/Senha/), 'segredo');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/agent/tickets/42?aba=1'));
    expect(login).toHaveBeenCalledWith('a@b.c', 'segredo');
  });

  it('loading: pede restore e mostra a sessão válida', async () => {
    const restore = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      useSession.setState({ status: 'authenticated', user: USER });
    });
    useSession.setState({ status: 'loading', restore });
    renderAt('/agent/home');
    expect(screen.getByRole('status', { name: 'Verificando sessão' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Área do agente' })).toBeInTheDocument();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('401 durante o uso (expire) leva ao login com aviso', async () => {
    useSession.setState({ status: 'authenticated', user: USER });
    renderAt('/agent/home');
    useSession.getState().expire();
    expect(await screen.findByText(/sua sessão expirou/i)).toBeInTheDocument();
  });
});

describe('Login: 2FA e erros', () => {
  it('mostra o campo de código quando o login pede 2FA e conclui', async () => {
    const login = vi.fn(async () => {
      useSession.setState({ status: 'two_factor', twoFactor: 'email' });
      return 'two_factor' as const;
    });
    const verifyTwoFactor = vi.fn(async () => {
      useSession.setState({ status: 'authenticated', user: USER, twoFactor: null });
      return true;
    });
    useSession.setState({ login, verifyTwoFactor });
    renderAt('/agent/home');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/E-mail/), 'a@b.c');
    await user.type(screen.getByLabelText(/Senha/), 'x');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Verificação em duas etapas' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Código de verificação/), '123456');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('heading', { name: 'Área do agente' })).toBeInTheDocument();
    expect(verifyTwoFactor).toHaveBeenCalledWith('123456');
  });

  it('exibe a mensagem de erro (ex.: conta de cliente)', async () => {
    useSession.setState({ error: 'Esta conta é de cliente.' });
    renderAt('/login');
    expect(await screen.findByText('Esta conta é de cliente.')).toBeInTheDocument();
  });
});
