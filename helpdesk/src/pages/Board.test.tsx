import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as boardApi from '@/api/board';
import { ApiError } from '@/api/errors';
import { resetBoardMock } from '@/api/mock/board';
import { resetDb } from '@/api/mock/db';
import { resetBoardStore } from '@/store/board';
import { useUi } from '@/store/useUi';
import Board from './Board';

const openTicket = vi.fn();
vi.mock('@/components/shell/openTab', () => ({ openTicket: (...a: unknown[]) => openTicket(...a), openSearch: vi.fn() }));
vi.mock('@/api/board', async (orig) => {
  const real = await orig<typeof import('@/api/board')>();
  return { ...real, listBoards: vi.fn(real.listBoards), placeCard: vi.fn(real.placeCard) };
});

const renderBoard = () => render(<MemoryRouter><Board /></MemoryRouter>);
const columnOf = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}:`) });
const cardIn = (col: HTMLElement) => within(col).getAllByRole('article')[0]!;
const dt = () => ({ dataTransfer: { setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' } });

beforeEach(() => {
  resetDb();
  resetBoardMock();
  resetBoardStore();
  useUi.setState({ toasts: [] });
  openTicket.mockClear();
  vi.mocked(boardApi.placeCard).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('Quadro', () => {
  it('mostra o esqueleto e depois as colunas com contagem, cartões e o seletor de quadro', async () => {
    renderBoard();
    expect(screen.getByRole('status', { name: 'Carregando o quadro' })).toBeInTheDocument();
    await screen.findByRole('region', { name: /^Novo:/ });
    expect(screen.getByRole('combobox', { name: 'Quadro' })).toHaveTextContent('Suporte · semana');
    const cols = screen.getAllByRole('region').filter((r) => r.hasAttribute('data-column-key'));
    expect(cols.length).toBeGreaterThanOrEqual(6);
    const first = cardIn(columnOf('Novo'));
    expect(within(first).getByText(/^TD-\d+$/)).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: /TD-\d+, posição 1 de/ })).toBeInTheDocument();
    expect(within(columnOf('Novo')).getByRole('heading', { level: 2, name: 'Novo' })).toBeInTheDocument();
    expect(screen.getByText(/^\d+ tickets$/)).toBeInTheDocument();
  });

  it('clicar no cartão abre o ticket', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('region', { name: /^Novo:/ });
    const card = cardIn(columnOf('Novo'));
    await user.click(within(card).getByRole('button', { name: /posição/ }));
    expect(openTicket).toHaveBeenCalledWith(Number(card.getAttribute('data-ticket-id')), expect.objectContaining({ title: expect.any(String) }));
  });

  it('Mover para… pelo menu do cartão muda de coluna e devolve o foco ao cartão', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('region', { name: /^Novo:/ });
    const card = cardIn(columnOf('Novo'));
    const id = card.getAttribute('data-ticket-id')!;
    await user.click(within(card).getByRole('button', { name: /^Ações de TD-\d+/ }));
    expect(await screen.findByText('Mover para…')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Novo' })).not.toBeInTheDocument(); // a coluna atual não entra
    expect(screen.queryByRole('menuitem', { name: 'Resolvido' })).not.toBeInTheDocument(); // conclusão não entra
    await user.click(screen.getByRole('menuitem', { name: 'Aberto' }));
    await waitFor(() => expect(document.querySelector(`[data-ticket-id="${id}"]`)!.closest('section')).toHaveAttribute('aria-label', expect.stringMatching(/^Aberto:/)));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-card-open', id));
    expect(screen.getByText(/^TD-\d+ movido para Aberto\.$/)).toBeInTheDocument();
  });

  it('atalhos de teclado: Alt+seta direita muda de coluna; M abre o menu', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('region', { name: /^Novo:/ });
    const id = cardIn(columnOf('Novo')).getAttribute('data-ticket-id')!;
    const button = () => document.querySelector<HTMLElement>(`[data-card-open="${id}"]`)!;
    button().focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await waitFor(() => expect(button().closest('section')).toHaveAttribute('aria-label', expect.stringMatching(/^Aberto:/)));
    await waitFor(() => expect(document.activeElement).toBe(button()));
    await user.keyboard('m');
    expect(await screen.findByText('Mover para…')).toBeInTheDocument();
    await user.keyboard('{Escape}');
  });

  it('arrastar e soltar em outra coluna (HTML5) muda o status; soltar na conclusão avisa e não muda', async () => {
    renderBoard();
    await screen.findByRole('region', { name: /^Novo:/ });
    const card = cardIn(columnOf('Novo'));
    const id = card.getAttribute('data-ticket-id')!;
    const list = within(columnOf('Aberto')).getByRole('list');
    fireEvent.dragStart(card, dt());
    fireEvent.dragOver(list, dt());
    fireEvent.drop(list, dt());
    await waitFor(() => expect(document.querySelector(`[data-ticket-id="${id}"]`)!.closest('section')).toHaveAttribute('aria-label', expect.stringMatching(/^Aberto:/)));
    expect(boardApi.placeCard).toHaveBeenCalledTimes(1);

    const again = document.querySelector<HTMLElement>(`[data-ticket-id="${id}"]`)!;
    fireEvent.dragStart(again, dt());
    const done = within(columnOf('Resolvido')).getByRole('list');
    fireEvent.dragOver(done, dt());
    fireEvent.drop(done, dt());
    await waitFor(() => expect(useUi.getState().toasts.some((t) => /não pode ser concluído arrastando/.test(t.title))).toBe(true));
    expect(boardApi.placeCard).toHaveBeenCalledTimes(1);
    expect(document.querySelector(`[data-ticket-id="${id}"]`)!.closest('section')).toHaveAttribute('aria-label', expect.stringMatching(/^Aberto:/));
  });

  it('o backend recusa o move: o cartão volta e aparece o aviso', async () => {
    renderBoard();
    await screen.findByRole('region', { name: /^Novo:/ });
    const card = cardIn(columnOf('Novo'));
    const id = card.getAttribute('data-ticket-id')!;
    vi.mocked(boardApi.placeCard).mockRejectedValueOnce(new ApiError('Você não tem permissão para esta ação.', { status: 403 }));
    const list = within(columnOf('Aberto')).getByRole('list');
    fireEvent.dragStart(card, dt());
    fireEvent.dragOver(list, dt());
    fireEvent.drop(list, dt());
    await waitFor(() => expect(useUi.getState().toasts.some((t) => t.title.includes('Não foi possível mover'))).toBe(true));
    expect(document.querySelector(`[data-ticket-id="${id}"]`)!.closest('section')).toHaveAttribute('aria-label', expect.stringMatching(/^Novo:/));
  });

  it('filtros e busca: só atrasados, prioridade e texto; limpar filtros', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('region', { name: /^Novo:/ });
    const total = document.querySelectorAll('article').length;
    await user.click(screen.getByRole('switch', { name: 'Só atrasados' }));
    const overdue = document.querySelectorAll('article').length;
    expect(overdue).toBeGreaterThan(0);
    expect(overdue).toBeLessThan(total);
    document.querySelectorAll('article').forEach((a) => expect(a.textContent).toMatch(/Atrasado/));
    await user.click(screen.getByRole('button', { name: /Limpar filtros/ }));
    expect(document.querySelectorAll('article').length).toBe(total);
    await user.type(screen.getByRole('textbox', { name: 'Buscar no quadro' }), 'zzzz-nada');
    expect(document.querySelectorAll('article').length).toBe(0);
    expect(screen.getAllByText('Nenhum ticket com os filtros atuais.').length).toBeGreaterThan(0);
    expect(screen.getByText(/^0 de \d+ tickets$/)).toBeInTheDocument();
  });

  it('colunas de organização: criar, renomear e excluir com confirmação', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('region', { name: /^Novo:/ });
    await user.click(screen.getByRole('button', { name: 'Nova coluna' }));
    await user.type(screen.getByRole('textbox', { name: /Nome da coluna/ }), 'AG-board fila');
    await user.click(screen.getByRole('button', { name: 'Criar coluna' }));
    const lane = await screen.findByRole('region', { name: /^AG-board fila:/ });
    expect(lane).toHaveAccessibleName(/coluna de organização/);

    await user.click(within(lane).getByRole('button', { name: 'Ações da coluna AG-board fila' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renomear coluna…' }));
    const input = screen.getByRole('textbox', { name: /Nome da coluna/ });
    await user.clear(input);
    await user.type(input, 'AG-board fila 2');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    const renamed = await screen.findByRole('region', { name: /^AG-board fila 2:/ });

    await user.click(within(renamed).getByRole('button', { name: 'Ações da coluna AG-board fila 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir coluna…' }));
    const confirm = await screen.findByRole('dialog');
    expect(confirm).toHaveTextContent(/Nenhum ticket é apagado/);
    await user.click(within(confirm).getByRole('button', { name: 'Excluir coluna' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: /^AG-board fila 2:/ })).not.toBeInTheDocument());
  });

  it('prazo interno pelo menu do cartão e limite de trabalho pelo menu da coluna', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('region', { name: /^Aberto:/ });
    const card = cardIn(columnOf('Aberto'));
    await user.click(within(card).getByRole('button', { name: /^Ações de TD-\d+/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Definir prazo interno|Alterar prazo interno/ }));
    fireEvent.change(screen.getByLabelText('Data do prazo'), { target: { value: '2020-01-02' } });
    await user.click(screen.getByRole('button', { name: 'Salvar prazo' }));
    await waitFor(() => expect(within(document.querySelector(`[data-ticket-id="${card.getAttribute('data-ticket-id')}"]`)!as HTMLElement).getByText(/Atrasado: 02\/01/)).toBeInTheDocument());

    await user.click(within(columnOf('Aberto')).getByRole('button', { name: 'Ações da coluna Aberto' }));
    await user.click(screen.getByRole('menuitem', { name: /limite de trabalho/i }));
    await user.type(screen.getByLabelText('Máximo de tickets'), '1');
    await user.click(screen.getByRole('button', { name: 'Salvar limite' }));
    await waitFor(() => expect(within(columnOf('Aberto')).getByText('Limite 1')).toBeInTheDocument());
    expect(within(columnOf('Aberto')).getByText(/ultrapassado/)).toBeInTheDocument();
  });

  it('criar quadro e excluir quadro (confirmação)', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('region', { name: /^Novo:/ });
    await user.click(screen.getByRole('button', { name: 'Novo quadro' }));
    await user.type(screen.getByRole('textbox', { name: /Nome do quadro/ }), 'AG-board extra');
    await user.click(screen.getByRole('button', { name: 'Criar quadro' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Quadro' })).toHaveTextContent('AG-board extra'));
    await user.click(screen.getByRole('button', { name: 'Ações do quadro' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir quadro…' }));
    const confirm = await screen.findByRole('dialog');
    expect(confirm).toHaveTextContent(/Os tickets não são afetados/);
    await user.click(within(confirm).getByRole('button', { name: 'Excluir quadro' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Quadro' })).toHaveTextContent('Suporte · semana'));
  });

  it('erro ao carregar os quadros mostra Tentar novamente', async () => {
    const user = userEvent.setup();
    vi.mocked(boardApi.listBoards).mockRejectedValueOnce(new ApiError('Sem conexão com o servidor.', { status: 0 }));
    renderBoard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sem conexão com o servidor.');
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByRole('region', { name: /^Novo:/ });
  });

  it('sem quadros: estado vazio com criar quadro', async () => {
    vi.mocked(boardApi.listBoards).mockResolvedValueOnce([]);
    renderBoard();
    expect(await screen.findByText('Nenhum quadro ainda')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Novo quadro' }).length).toBeGreaterThan(0);
  });

  it('reflete o tempo real: ticket que muda na lista do app recarrega o quadro', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderBoard();
      await screen.findByRole('region', { name: /^Novo:/ });
      const before = document.querySelectorAll('article').length;
      const { db } = await import('@/api/mock/db');
      const ticket = db.tickets.find((t) => t.statusId === 'solved') ?? db.tickets[0]!;
      db.tickets[db.tickets.indexOf(ticket)] = { ...ticket, statusId: 'new', updatedAt: new Date().toISOString() };
      const { useTickets } = await import('@/store/useTickets');
      await act(async () => {
        useTickets.setState({ tickets: [...useTickets.getState().tickets, { ...ticket, id: 4242, updatedAt: 'agora' }] });
        await vi.advanceTimersByTimeAsync(1000);
      });
      await waitFor(() => expect(document.querySelectorAll('article').length).toBe(before + 1));
    } finally {
      vi.useRealTimers();
    }
  });
});
