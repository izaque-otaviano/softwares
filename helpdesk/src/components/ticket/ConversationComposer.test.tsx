import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { TooltipProvider } from '@/components/ui';
import TicketPage from '@/pages/Ticket';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useFormStore } from './formStore';
import { resetTicketLookups } from './useTicketLookups';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Routes>
          <Route path="/agent/tickets/:id" element={<TicketPage />} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  resetDb();
  resetDirectoryCache();
  resetTicketLookups();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useFormStore.setState({ forms: {} });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useTickets.setState({ loaded: false, loading: false, error: null, tickets: [], counts: {} });
});
afterEach(() => {
  // avisos de act() vêm de cargas assíncronas de outros painéis; qualquer outro erro de console reprova.
  const real = errorSpy.mock.calls.filter((c: unknown[]) => !String(c[0]).includes('not wrapped in act'));
  expect(real).toEqual([]);
  errorSpy.mockRestore();
});

async function open() {
  await useTickets.getState().load();
  const t = useTickets.getState().tickets.find((x) => x.comments.some((c) => !c.public) && x.comments.some((c) => c.public))!;
  renderAt(`/agent/tickets/${t.id}`);
  const composer = await screen.findByTestId('composer');
  return { t, key: `ticket:${t.id}`, composer };
}

describe('Conversa e Composer', () => {
  it('alternar para observação interna muda a cor, esconde Para/CC e persiste no store', async () => {
    const { key, composer } = await open();
    expect(composer).toHaveClass('bg-surface');
    expect(await within(composer).findByText('Para')).toBeInTheDocument();
    expect(await within(composer).findByRole('button', { name: 'CC' })).toBeInTheDocument();
    await userEvent.click(within(composer).getByRole('button', { name: /Modo de resposta/ }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Observação interna/ }));
    await waitFor(() => expect(composer).toHaveClass('bg-note-bg'));
    expect(within(composer).queryByText('Para')).toBeNull();
    expect(within(composer).queryByRole('button', { name: 'CC' })).toBeNull();
    expect(within(composer).queryByRole('button', { name: 'Limpar formatação' })).toBeNull();
    expect(within(composer).getByText('Observação interna', { selector: 'span' })).toBeInTheDocument();
    expect(useFormStore.getState().forms[key]!.replyMode).toBe('internal');
  });

  it('modo Chamada mostra o campo de número em ticket existente', async () => {
    const { key, composer } = await open();
    useFormStore.getState().setReplyMode(key, 'call');
    await userEvent.type(await within(composer).findByLabelText('Insira um número'), '1199');
    expect(useFormStore.getState().forms[key]!.callNumber).toBe('1199');
  });

  it('link CC abre o campo de e-mails', async () => {
    const { key, composer } = await open();
    await userEvent.click(await within(composer).findByRole('button', { name: 'CC' }));
    expect(useFormStore.getState().forms[key]!.ccOpen).toBe(true);
    expect(await within(composer).findByLabelText('CC (e-mails)')).toBeInTheDocument();
  });

  it('relê o corpo do formStore quando bodyRev muda (macro, envio, reset)', async () => {
    const { key } = await open();
    const editor = await screen.findByRole('textbox', { name: 'Mensagem' });
    useFormStore.setState((st) => ({ forms: { ...st.forms, [key]: { ...st.forms[key]!, bodyHtml: '<p>Texto da macro</p>', bodyRev: st.forms[key]!.bodyRev + 1 } } }));
    await waitFor(() => expect(editor).toHaveTextContent('Texto da macro'));
    useFormStore.setState((st) => ({ forms: { ...st.forms, [key]: { ...st.forms[key]!, bodyHtml: '', bodyRev: st.forms[key]!.bodyRev + 1 } } }));
    await waitFor(() => expect(editor).not.toHaveTextContent('Texto da macro'));
  });

  it('filtro da conversa separa públicas e internas; histórico liga eventos', async () => {
    const { t } = await open();
    await screen.findAllByTestId('message');
    const total = screen.getAllByTestId('message').length;
    expect(total).toBe(t.comments.length);
    expect(screen.queryAllByTestId('event')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Filtrar conversa' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Observações internas' }));
    await waitFor(() => expect(screen.getAllByTestId('message').every((m) => m.dataset.kind === 'internal')).toBe(true));
    expect(screen.getAllByText('Interno').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Filtrar conversa' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Mensagens públicas' }));
    await waitFor(() => expect(screen.getAllByTestId('message').every((m) => m.dataset.kind === 'public')).toBe(true));

    await userEvent.click(screen.getByRole('button', { name: 'Histórico de eventos' }));
    expect((await screen.findAllByTestId('event')).length).toBe(t.events.length);
  });

  it('cabeçalho: metadados, resumo e menu com ações destrutivas confirmadas', async () => {
    const { t } = await open();
    expect(await screen.findByRole('heading', { name: t.subject })).toBeInTheDocument();
    expect(screen.getByText(t.channel === 'email' ? 'Pelo e-mail' : 'Pelo formulário web')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Exibir resumo do ticket' }));
    expect(screen.getByRole('region', { name: 'Resumo do ticket' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações do ticket' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Apagar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/só um administrador pode restaurá-lo/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  });
});
