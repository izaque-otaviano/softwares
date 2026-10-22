import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui';
import { useSearchUi } from './searchState';
import { ShortcutsHelpDialog } from './ShortcutsHelp';
import { useGlobalShortcuts, useHelpShortcut, useShortcutsHelp } from './shortcuts';

function Harness() {
  const loc = useLocation();
  useGlobalShortcuts();
  useHelpShortcut();
  return (
    <TooltipProvider>
      <div data-testid="loc">{loc.pathname}</div>
      <input aria-label="Campo" />
      <textarea aria-label="Texto" />
      <ShortcutsHelpDialog />
    </TooltipProvider>
  );
}

function setup() {
  return render(
    <MemoryRouter initialEntries={['/agent/home']}>
      <Harness />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useShortcutsHelp.setState({ open: false });
  useSearchUi.setState({ open: false });
});

describe('atalhos globais', () => {
  it('"?" abre a ajuda com a lista de atalhos e Esc fecha', async () => {
    setup();
    await userEvent.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Atalhos de teclado' });
    for (const label of ['Ir para Início', 'Ir para Visualizações', 'Abrir a busca', 'Enviar o ticket', 'Abrir a visualização da macro destacada', 'Fechar menu, popover, painel ou diálogo']) {
      expect(dialog).toHaveTextContent(label);
    }
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"?" digitado em campo de texto não abre a ajuda', async () => {
    setup();
    await userEvent.type(screen.getByRole('textbox', { name: 'Campo' }), 'o que?');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveValue('o que?');
  });

  it('"/" e "g v" não disparam enquanto se digita', async () => {
    setup();
    await userEvent.type(screen.getByRole('textbox', { name: 'Texto' }), '/ g v');
    expect(useSearchUi.getState().open).toBe(false);
    expect(screen.getByTestId('loc')).toHaveTextContent('/agent/home');
  });

  it('"g" depois "v" vai para Visualizações e "g" depois "h" volta ao Início', async () => {
    setup();
    await userEvent.keyboard('gv');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/agent/views'));
    await userEvent.keyboard('gh');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/agent/home'));
  });

  it('com a ajuda aberta, as teclas de navegação não disparam por baixo do diálogo', async () => {
    setup();
    await userEvent.keyboard('?');
    await screen.findByRole('dialog');
    await userEvent.keyboard('/');
    expect(useSearchUi.getState().open).toBe(false);
  });

  it('Ctrl+/ não é interceptado', async () => {
    setup();
    await userEvent.keyboard('{Control>}/{/Control}');
    expect(useSearchUi.getState().open).toBe(false);
  });
});
