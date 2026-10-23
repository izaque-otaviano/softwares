import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ticketsApi from '@/api/tickets';
import { ApiError } from '@/api/errors';
import { db, resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { registerNavigate } from '@/components/shell/openTab';
import { TooltipProvider } from '@/components/ui';
import TicketPage from '@/pages/Ticket';
import { useAiSummary } from '@/store/useAiSummary';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import { useFormStore } from './formStore';
import { resetTicketLookups } from './useTicketLookups';

// Modo mock (como todos os testes), com a fachada espiável e a capacidade do resumo de IA ajustável por teste.
let aiIsReal = true;
vi.mock('@/api/capabilities', async (orig) => ({ ...(await orig<typeof import('@/api/capabilities')>()), isRealCapability: () => aiIsReal }));
vi.mock('@/api/tickets', async (orig) => {
  const m = await orig<typeof import('@/api/tickets')>();
  return { ...m, deleteTickets: vi.fn(m.deleteTickets), generateAiSummary: vi.fn(m.generateAiSummary) };
});

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

beforeEach(async () => {
  aiIsReal = true;
  resetDb();
  resetDirectoryCache();
  resetTicketLookups();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useFormStore.setState({ forms: {} });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useUi.setState({ toasts: [] });
  useAiSummary.setState({ byTicket: {} });
  useTickets.setState({ loaded: false, loading: false, error: null, tickets: [], counts: {} });
  await useTickets.getState().load();
});
afterEach(() => vi.clearAllMocks());

const firstTicket = () => useTickets.getState().tickets.find((x) => x.comments.some((c) => c.public) && x.ccIds.length === 0)!;

describe('resumo de IA na conversa', () => {
  const openSummary = async () => {
    const t = firstTicket();
    renderAt(`/agent/tickets/${t.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Exibir resumo do ticket' }));
    return { t, panel: screen.getByRole('region', { name: 'Resumo do ticket' }) };
  };

  it('só gera ao clicar; mostra o texto, o aviso de privacidade e "truncado"', async () => {
    vi.mocked(ticketsApi.generateAiSummary).mockResolvedValueOnce({ summary: 'A cliente pede segunda via.', generatedAt: new Date().toISOString(), provider: 'anthropic', truncated: true });
    const { panel } = await openSummary();
    expect(ticketsApi.generateAiSummary).not.toHaveBeenCalled();
    expect(within(panel).getByText(/Dados pessoais são mascarados antes do envio/)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Gerar resumo' }));
    expect(await within(panel).findByText('A cliente pede segunda via.')).toBeInTheDocument();
    expect(within(panel).getByText(/Resumo truncado/)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Gerar de novo' })).toBeInTheDocument();
  });

  it('resumo inteiro: sem aviso de truncado', async () => {
    vi.mocked(ticketsApi.generateAiSummary).mockResolvedValueOnce({ summary: 'Resumo curto.', generatedAt: new Date().toISOString(), provider: 'anthropic', truncated: false });
    const { panel } = await openSummary();
    await userEvent.click(within(panel).getByRole('button', { name: 'Gerar resumo' }));
    await within(panel).findByText('Resumo curto.');
    expect(within(panel).queryByText(/truncado/)).toBeNull();
  });

  it('503 ai_not_configured: aviso informativo (não é erro grave) com a frase da conta', async () => {
    vi.mocked(ticketsApi.generateAiSummary).mockRejectedValueOnce(new ApiError('O resumo por IA não está configurado nesta conta.', { status: 503, code: 'ai_not_configured' }));
    const { panel } = await openSummary();
    await userEvent.click(within(panel).getByRole('button', { name: 'Gerar resumo' }));
    const msg = await within(panel).findByText('O resumo por IA não está configurado nesta conta.');
    expect(msg.closest('[data-tone]')).toHaveAttribute('data-tone', 'info');
    expect(within(panel).queryByRole('alert')).toBeNull();
  });

  it.each([
    [502, 'ai_provider_error', 'O provedor de IA não respondeu agora. Tente gerar o resumo de novo em instantes.'],
    [429, undefined, 'Você atingiu o limite de resumos por IA (20 por hora). Tente de novo mais tarde.'],
    [403, undefined, 'Você não tem permissão para gerar o resumo deste ticket.'],
  ])('%i vira erro com mensagem clara e dá para tentar de novo', async (status, code, message) => {
    vi.mocked(ticketsApi.generateAiSummary).mockRejectedValueOnce(new ApiError(message, { status, code }));
    const { panel } = await openSummary();
    await userEvent.click(within(panel).getByRole('button', { name: 'Gerar resumo' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(message);
    expect(within(panel).getByRole('button', { name: 'Gerar resumo' })).toBeEnabled();
  });

  it('modo mock: resumo simulado e sem a promessa de máscara (nada sai do navegador)', async () => {
    aiIsReal = false;
    const { panel } = await openSummary();
    expect(within(panel).getByText(/Resumo simulado/)).toBeInTheDocument();
    expect(within(panel).queryByText(/mascarados/)).toBeNull();
    vi.mocked(ticketsApi.generateAiSummary).mockRestore?.();
  });
});

describe('CC de terceiros no compositor (ticket existente)', () => {
  const openCc = async () => {
    const t = firstTicket();
    renderAt(`/agent/tickets/${t.id}`);
    const composer = await screen.findByTestId('composer');
    await userEvent.click(await within(composer).findByRole('button', { name: 'CC' }));
    return { t, composer, input: await within(composer).findByLabelText('CC (e-mails)') };
  };

  it('Enter grava na hora, mostra o chip e o contador; remover tira do ticket', async () => {
    const { t, composer, input } = await openCc();
    await userEvent.type(input, 'terceiro@exemplo.com{Enter}');
    const list = await within(composer).findByRole('list', { name: 'E-mails em cópia' });
    expect(within(list).getByText('terceiro@exemplo.com')).toBeInTheDocument();
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.ccList).toHaveLength(1);
    expect(within(composer).getByText(/1 de 20/)).toBeInTheDocument();
    // o formulário acompanha sem ficar "sujo" por causa do CC
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.values.ccIds).toEqual(['terceiro@exemplo.com']);
    expect(useFormStore.getState().isDirty(`ticket:${t.id}`)).toBe(false);
    await userEvent.click(within(list).getByRole('button', { name: 'Remover terceiro@exemplo.com do CC' }));
    await waitFor(() => expect(within(composer).queryByRole('list', { name: 'E-mails em cópia' })).toBeNull());
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.ccList).toEqual([]);
  });

  it('e-mail inválido e repetido mostram o erro no campo e não chamam o servidor', async () => {
    const { composer, input } = await openCc();
    await userEvent.type(input, 'sem-arroba{Enter}');
    expect(await within(composer).findByRole('alert')).toHaveTextContent('Informe um e-mail válido.');
    await userEvent.clear(input);
    await userEvent.type(input, 'a@b.co{Enter}');
    await within(composer).findByRole('list', { name: 'E-mails em cópia' });
    await userEvent.type(input, 'A@B.CO{Enter}');
    expect(await within(composer).findByRole('alert')).toHaveTextContent('Este e-mail já está em cópia.');
    expect(within(composer).getAllByRole('listitem')).toHaveLength(1);
  });

  it('400 do servidor (e-mail do solicitante) aparece no campo e o digitado é mantido', async () => {
    const t = firstTicket();
    const requester = db.users.find((u) => u.id === t.requesterId)!;
    renderAt(`/agent/tickets/${t.id}`);
    const composer = await screen.findByTestId('composer');
    await userEvent.click(await within(composer).findByRole('button', { name: 'CC' }));
    const input = await within(composer).findByLabelText('CC (e-mails)');
    await userEvent.type(input, `${requester.email}{Enter}`);
    expect(await within(composer).findByRole('alert')).toHaveTextContent('Este e-mail é o do solicitante');
    expect(input).toHaveValue(requester.email);
  });

  it('ticket que já tem CC abre a linha sozinha', async () => {
    const t = firstTicket();
    await useTickets.getState().addCc(t.id, { email: 'ja@exemplo.com' });
    renderAt(`/agent/tickets/${t.id}`);
    const composer = await screen.findByTestId('composer');
    expect(await within(composer).findByText('ja@exemplo.com')).toBeInTheDocument();
  });
});

describe('seguidores no painel de propriedades', () => {
  it('"seguir" grava na hora, vira chip e dá para remover', async () => {
    const t = useTickets.getState().tickets.find((x) => !x.followerIds.includes('me'))!;
    renderAt(`/agent/tickets/${t.id}`);
    const panel = await screen.findByRole('complementary', { name: 'Propriedades do ticket' });
    await userEvent.click(await within(panel).findByRole('button', { name: 'seguir' }));
    const chips = await within(panel).findByRole('list', { name: 'Seguidores atuais' });
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.followerIds).toContain('me');
    expect(within(panel).queryByRole('button', { name: 'seguir' })).toBeNull();
    await userEvent.click(within(chips).getAllByRole('button', { name: /^Remover / }).at(-1)!);
    await waitFor(() => expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.followerIds).not.toContain('me'));
  });
});

describe('apagar e restaurar', () => {
  const navigate = vi.fn();
  afterEach(() => registerNavigate(null));
  const openMenuDelete = async () => {
    const t = firstTicket();
    navigate.mockClear();
    registerNavigate(navigate);
    useTabs.getState().openTab({ kind: 'ticket', refId: String(t.id), title: t.subject });
    renderAt(`/agent/tickets/${t.id}`);
    await screen.findByTestId('composer');
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações do ticket' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Apagar' }));
    return { t, dialog: await screen.findByRole('dialog') };
  };

  it('confirmação forte explica o efeito; confirmar apaga, tira da store e fecha a aba', async () => {
    const { t, dialog } = await openMenuDelete();
    expect(within(dialog).getByText(/sai de todas as listas, da busca e dos relatórios/)).toBeInTheDocument();
    expect(within(dialog).getByText(/horas de manutenção lançadas/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus(); // Enter nunca apaga por engano
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/agent/home'));
    expect(useTickets.getState().tickets.some((x) => x.id === t.id && !x.deletedAt)).toBe(false);
    expect(useTabs.getState().tabs.some((x) => x.id === `ticket:${t.id}`)).toBe(false);
  });

  it('409 (horas lançadas): o ticket continua na store e na tela, com a mensagem em toast', async () => {
    const { t, dialog } = await openMenuDelete();
    const message = `O ticket #${t.id} não pode ser apagado: ele tem horas de manutenção lançadas.`;
    vi.mocked(ticketsApi.deleteTickets).mockResolvedValueOnce({ deleted: [], failed: [{ id: t.id, message, status: 409, code: 'ticket_conflict' }] });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(useUi.getState().toasts.at(-1)).toMatchObject({ tone: 'error', title: message }));
    expect(useTickets.getState().tickets.some((x) => x.id === t.id)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(useTabs.getState().tabs.some((x) => x.id === `ticket:${t.id}`)).toBe(true);
    expect(screen.getByTestId('composer')).toBeInTheDocument();
  });

  it('admin abre o ticket apagado: banner com quando/quem, só leitura, e Restaurar traz de volta', async () => {
    const t = firstTicket();
    await useTickets.getState().deleteTickets([t.id]);
    renderAt(`/agent/tickets/${t.id}`);
    const banner = await screen.findByText(/^Apagado em /);
    expect(banner).toHaveTextContent('por Você');
    expect(screen.queryByTestId('composer')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(screen.queryByText(/^Apagado em /)).toBeNull());
    expect(await screen.findByTestId('composer')).toBeInTheDocument();
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)?.deletedAt).toBeUndefined();
    expect(useUi.getState().toasts.at(-1)!.title).toBe(`Ticket #${t.id} restaurado`);
  });
});
