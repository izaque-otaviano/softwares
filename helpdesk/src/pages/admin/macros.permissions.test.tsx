import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi, resetDb } from '@/api';
import { TooltipProvider } from '@/components/ui';
import { useSession } from '@/store/useSession';
import { useTickets } from '@/store/useTickets';
import MacroEdit from './MacroEdit';
import Macros from './Macros';

// Nos testes o modo é mock (tudo permitido); aqui a checagem roda como no modo real, sobre `me.permissions`.
vi.mock('@/lib/permissions', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/permissions')>();
  return { ...mod, useCan: (anyOf: string | readonly string[]) => mod.userCan(useSession.getState().user, anyOf, true) };
});

const as = (permissions: string[]) =>
  useSession.setState({ status: 'authenticated', user: { id: '7', name: 'Ana', email: 'a@b.c', role: 'agent', teams: [], permissions } });

function renderMacros(path = '/admin/macros') {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/macros" element={<Macros />} />
          <Route path="/admin/macros/new" element={<MacroEdit />} />
          <Route path="/admin/macros/:id" element={<MacroEdit />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(async () => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  await useTickets.getState().loadStatuses();
});

describe('Macros: permissão macro.manage', () => {
  it('agente sem macro.manage: não vê Criar macro nem Ações; a lista segue visível, com aviso', async () => {
    as(['macro.use', 'ticket.view']);
    renderMacros();
    expect(await screen.findByRole('group', { name: 'Macros' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar macro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ações' })).toBeNull();
    expect(screen.getByText(/só quem tem a permissão de gerenciar macros/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0); // sem seleção em lote
  });

  it('com macro.manage vê Criar macro e as ações em lote', async () => {
    as(['macro.manage']);
    renderMacros();
    expect(await screen.findByRole('button', { name: 'Criar macro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ações' })).toBeInTheDocument();
    expect(screen.queryByText(/só quem tem a permissão/i)).toBeNull();
  });

  it('administrador (settings.manage) também grava macros, mesmo sem macro.manage na lista', async () => {
    as(['settings.manage']);
    renderMacros();
    expect(await screen.findByRole('button', { name: 'Criar macro' })).toBeInTheDocument();
  });

  it('tela de edição sem permissão: somente leitura, campos desabilitados e sem Salvar', async () => {
    as(['macro.use']);
    renderMacros('/admin/macros/new');
    expect(await screen.findByText(/Somente leitura/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome da macro/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Voltar às macros' })).toBeInTheDocument();
  });

  it('tela de edição com permissão: campos editáveis e Salvar', async () => {
    as(['macro.manage']);
    renderMacros('/admin/macros/new');
    await waitFor(() => expect(screen.getByLabelText(/Nome da macro/)).toBeEnabled());
    await userEvent.type(screen.getByLabelText(/Nome da macro/), 'x');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });
});
