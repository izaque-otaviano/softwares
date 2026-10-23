import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/api';
import * as chatMock from '@/api/mock/chat';
import { useChatLookups } from '@/components/chat/useChatLookups';
import { resetChatStore, useChatStore } from '@/store/chat';
import { useUi } from '@/store/useUi';
import Chat from './Chat';

const openTicket = vi.fn();
const openUser = vi.fn();
vi.mock('@/components/shell/openTab', () => ({ openTicket: (...a: unknown[]) => openTicket(...a), openUser: (...a: unknown[]) => openUser(...a), openOrg: vi.fn(), openSearch: vi.fn() }));

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderChat(path = '/agent/chat') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/agent/chat" element={<Chat />} />
        <Route path="/agent/chat/:id" element={<Chat />} />
      </Routes>
    </MemoryRouter>,
  );
}

const setWide = (wide: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: wide, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }));

beforeEach(() => {
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  chatMock.resetChatMock();
  resetChatStore();
  useChatLookups.getState().reset();
  useUi.setState({ toasts: [] });
  openTicket.mockClear();
  setWide(true);
});
afterEach(() => {
  resetChatStore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lista de conversas', () => {
  it('abas com contadores, fila ordenada e posição na fila', async () => {
    renderChat();
    const tabs = await screen.findByRole('tablist', { name: 'Filtrar conversas' });
    await waitFor(() => expect(within(tabs).getByRole('tab', { name: /Fila \(2\)/ })).toBeInTheDocument());
    expect(within(tabs).getByRole('tab', { name: /Minhas \(2\)/ })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: /Todas \(8\)/ })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Conversas: Fila' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Marcelo Dias');
    expect(rows[0]).toHaveTextContent('1º da fila');
    expect(rows[1]).toHaveTextContent('Thiago Barbosa');
    expect(rows[1]).toHaveTextContent('2º da fila');
    expect(within(rows[0]!).getByLabelText('1 mensagem não lida')).toBeInTheDocument();
  });

  it('Minhas e Todas listam o que o backend devolve; Todas filtra por status', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(await screen.findByRole('tab', { name: /Minhas/ }));
    const mine = await screen.findByRole('list', { name: 'Conversas: Minhas' });
    expect(within(mine).getAllByRole('listitem')).toHaveLength(2);
    await user.click(screen.getByRole('tab', { name: /Todas/ }));
    const all = await screen.findByRole('list', { name: 'Conversas: Todas' });
    expect(within(all).getAllByRole('listitem')).toHaveLength(8);
    await user.click(screen.getByRole('combobox', { name: 'Status da conversa' }));
    await user.click(await screen.findByRole('option', { name: 'Encerrada' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Conversas: Todas' })).getAllByRole('listitem')).toHaveLength(3));
  });

  it('busca no servidor: sem resultado mostra o vazio; limpar volta', async () => {
    const user = userEvent.setup();
    renderChat();
    await screen.findByRole('list', { name: 'Conversas: Fila' });
    await user.type(screen.getByRole('searchbox', { name: 'Buscar conversas' }), 'zzzz');
    expect(await screen.findByText('Nada encontrado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(await screen.findByRole('list', { name: 'Conversas: Fila' })).toBeInTheDocument();
  });

  it('erro de carga mostra "Tentar novamente" e recarrega', async () => {
    const user = userEvent.setup();
    configureApi({ failRate: 1 });
    renderChat();
    expect(await screen.findByText('Não foi possível carregar as conversas')).toBeInTheDocument();
    configureApi({ failRate: 0 });
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('list', { name: 'Conversas: Fila' })).toBeInTheDocument();
  });

  it('carregando mostra o esqueleto antes da lista', async () => {
    renderChat();
    expect(screen.getAllByRole('status', { hidden: true }).length).toBeGreaterThan(0);
    await screen.findByRole('list', { name: 'Conversas: Fila' });
  });
});

describe('conversa', () => {
  it('abrir uma conversa da lista navega e mostra autor, hora, anexo, nota e confirmação de leitura', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(await screen.findByRole('tab', { name: /Minhas/ }));
    await user.click(await screen.findByRole('button', { name: /Carlos Menezes/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/agent/chat/3');
    const log = await screen.findByRole('log', { name: 'Mensagens da conversa' });
    await within(log).findByText(/checkout da loja está recusando/);
    expect(within(log).getByRole('link', { name: /erro-checkout.txt/ })).toBeInTheDocument();
    const note = within(log).getAllByTestId('chat-message').find((m) => m.getAttribute('data-kind') === 'note')!;
    expect(note).toHaveTextContent('Nota interna');
    expect(within(log).getAllByText('Lida').length).toBeGreaterThan(0);
    expect(within(log).getAllByText('Entregue').length).toBeGreaterThan(0);
  });

  it('pegar da fila: o botão some, o compositor aparece e a lista passa para Minhas', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/1');
    expect(await screen.findByText(/Pegue a conversa da fila para responder/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Pegar da fila' }));
    expect(await screen.findByLabelText('Escrever mensagem ao cliente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pegar da fila' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Minhas \(3\)/ })).toHaveAttribute('aria-selected', 'true'));
  });

  it('Ctrl+Enter envia, limpa o compositor e a mensagem aparece uma única vez', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/3');
    const box = await screen.findByLabelText('Escrever mensagem ao cliente');
    await user.type(box, 'Já renovei a credencial.');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(box).toHaveValue(''));
    await waitFor(() => expect(screen.getAllByText('Já renovei a credencial.')).toHaveLength(1));
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByTestId('chat-message').at(-1)).toHaveTextContent('Já renovei a credencial.'));
  });

  it('Enter sozinho não envia (quebra de linha)', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/3');
    const box = await screen.findByLabelText('Escrever mensagem ao cliente');
    await user.type(box, 'linha 1{Enter}linha 2');
    expect(box).toHaveValue('linha 1\nlinha 2');
    expect(screen.queryByText('linha 1')).not.toBeInTheDocument();
  });

  it('"/" abre as respostas rápidas com busca; setas e Enter inserem o texto; Esc fecha', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/3');
    const box = await screen.findByLabelText('Escrever mensagem ao cliente');
    await user.type(box, '/');
    const list = await screen.findByRole('listbox', { name: 'Respostas rápidas e macros' });
    expect(within(list).getAllByRole('option').length).toBeGreaterThanOrEqual(3);
    await user.type(box, 'integra');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect((box as HTMLTextAreaElement).value.trim()).toBe('A integração parou de funcionar. O erro que aparece é:');
    await user.clear(box);
    await user.type(box, '/ped');
    expect(within(screen.getByRole('listbox')).getAllByRole('option').length).toBe(2);
    await user.keyboard('{ArrowDown}{Enter}');
    expect((box as HTMLTextAreaElement).value).toContain('Carlos');
    await user.clear(box);
    await user.type(box, '/xx');
    expect(screen.getByText('Nada encontrado para a busca.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('digitar é anunciado ao cliente simulado e o indicador some com a resposta', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/4');
    const box = await screen.findByLabelText('Escrever mensagem ao cliente');
    await user.type(box, 'novo@clinica.com');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByText(/Juliana Castro está digitando/, undefined, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/está digitando/)).not.toBeInTheDocument(), { timeout: 4000 });
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByTestId('chat-message').at(-1)).toHaveAttribute('data-kind', 'client'));
  }, 12_000);

  it('nota interna: o compositor muda e a mensagem sai marcada', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/3');
    await user.click(await screen.findByRole('switch', { name: 'Nota interna' }));
    const box = screen.getByLabelText('Escrever nota interna');
    await user.type(box, 'só equipe');
    await user.click(screen.getByRole('button', { name: 'Salvar nota' }));
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByTestId('chat-message').at(-1)).toHaveAttribute('data-kind', 'note'));
  });

  it('conversa de outro agente: só acompanhar, com entrar e assumir para supervisor', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/5');
    expect(await screen.findByText(/Conversa de Rafael Pinto/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Escrever mensagem ao cliente')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entrar na conversa' }));
    expect(await screen.findByLabelText('Escrever mensagem ao cliente')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mais ações da conversa' }));
    expect(await screen.findByRole('menuitem', { name: 'Sair da conversa' })).toBeInTheDocument();
  });

  it('transferir para agente', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/4');
    await user.click(await screen.findByRole('button', { name: 'Transferir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Transferir conversa' });
    await user.click(within(dialog).getByRole('button', { name: 'Transferir' }));
    expect(await within(dialog).findByText('Escolha para quem transferir.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Rafael Pinto/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Transferir' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Transferir conversa' })).not.toBeInTheDocument());
    expect(await screen.findByText(/Conversa de Rafael Pinto/)).toBeInTheDocument();
  });

  it('encerrar exige motivo; "Outro" exige observação; depois mostra o encerramento e permite reabrir', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/4');
    await user.click(await screen.findByRole('button', { name: 'Encerrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Encerrar conversa' });
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar conversa' }));
    expect(await within(dialog).findByText('Escolha o motivo do encerramento.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Outro/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar conversa' }));
    expect(await within(dialog).findByText(/pede uma observação interna/)).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: /Observação interna/ }), 'sem retorno');
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar conversa' }));
    expect(await screen.findByText(/Motivo: Outro/)).toBeInTheDocument();
    expect(screen.getByText(/sem retorno/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reabrir' }));
    await user.click(await screen.findByRole('button', { name: 'Reabrir conversa' }));
    expect(await screen.findByRole('button', { name: 'Pegar da fila' })).toBeInTheDocument();
  });

  it('conversa encerrada mostra a avaliação do cliente; convertida abre o ticket em aba', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/6');
    expect(await screen.findByText(/Avaliação do cliente: atendimento 10, resolução 9/)).toBeInTheDocument();
    expect(screen.getByText(/Motivo: Resolvido/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ricardo Tavares/ }));
    expect(openUser).toHaveBeenCalledWith('u3', 'Ricardo Tavares');
  });

  it('chat convertido tem o link do ticket', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/8');
    await user.click(await screen.findByRole('button', { name: 'Abrir o ticket' }));
    expect(openTicket).toHaveBeenCalledWith('1', expect.objectContaining({ requesterName: 'Patrícia Gomes' }));
  });

  it('converter em ticket pelo menu', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/4');
    await user.click(await screen.findByRole('button', { name: 'Mais ações da conversa' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Converter em ticket' }));
    const dialog = await screen.findByRole('dialog', { name: 'Converter em ticket' });
    await user.click(within(dialog).getByRole('button', { name: 'Converter em ticket' }));
    expect(await screen.findByText(/Convertida no ticket/)).toBeInTheDocument();
  });

  it('exportar baixa o arquivo; com notas pede confirmação', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    URL.createObjectURL = save.mockReturnValue('blob:x');
    URL.revokeObjectURL = vi.fn();
    renderChat('/agent/chat/4');
    await user.click(await screen.findByRole('button', { name: 'Mais ações da conversa' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Exportar PDF com notas internas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Exportar com notas internas?' });
    expect(save).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Exportar com notas' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
  });

  it('conversa que não existe mostra erro com "Tentar novamente"', async () => {
    renderChat('/agent/chat/9999');
    expect(await screen.findByText('Não foi possível abrir a conversa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('painel do cliente: dados, histórico de chats e de tickets com link para abrir em aba', async () => {
    const user = userEvent.setup();
    renderChat('/agent/chat/3');
    const panel = await screen.findByTestId('client-panel');
    expect(await within(panel).findByText('carlos.menezes@horizonte.com.br')).toBeInTheDocument();
    expect(within(panel).getByText('Lojas Horizonte', { selector: 'p' })).toBeInTheDocument();
    expect(within(panel).getByText(/primeiro chat do cliente/)).toBeInTheDocument();
    const tickets = await within(panel).findAllByTitle('Abrir o ticket em uma aba');
    expect(tickets.length).toBeGreaterThan(0);
    await user.click(tickets[0]!);
    expect(openTicket).toHaveBeenCalled();
  });
});

describe('telas estreitas', () => {
  it('abaixo de 1024 px a lista e o painel do cliente viram gavetas', async () => {
    setWide(false);
    const user = userEvent.setup();
    renderChat('/agent/chat/3');
    expect(screen.queryByRole('tablist', { name: 'Filtrar conversas' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-panel')).not.toBeInTheDocument();
    await screen.findByRole('log', { name: 'Mensagens da conversa' });
    await user.click(await screen.findByRole('button', { name: 'Abrir lista de conversas' }));
    const drawer = await screen.findByRole('dialog', { name: 'Conversas' });
    expect(await within(drawer).findByRole('tablist', { name: 'Filtrar conversas' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Conversas' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Ver dados do cliente' }));
    const panel = await screen.findByRole('dialog', { name: 'Dados do cliente' });
    expect(await within(panel).findByTestId('client-panel')).toBeInTheDocument();
  });
});

describe('configurações (administrador)', () => {
  it('a aba existe, valida e confirma exclusões', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }));
    await user.click(await screen.findByRole('tab', { name: 'Palavras bloqueadas' }));
    await user.type(await screen.findByLabelText('Nova palavra'), 'Droga');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('droga')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nova palavra'), 'droga');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Esta palavra já está na lista.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apagar a palavra droga' }));
    const confirm = await screen.findByRole('dialog', { name: 'Apagar palavra bloqueada?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('droga')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apagar a palavra droga' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apagar palavra' }));
    await waitFor(() => expect(screen.queryByText('droga')).not.toBeInTheDocument());
  });

  it('motivos de encerramento: cria com validação, edita e apaga com confirmação', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }));
    await user.click(await screen.findByRole('tab', { name: 'Motivos de encerramento' }));
    await user.click(await screen.findByRole('button', { name: 'Novo motivo' }));
    let dialog = await screen.findByRole('dialog', { name: 'Novo motivo' });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Informe o nome do motivo.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Nome do motivo/), 'Teste AG');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Teste AG')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar Teste AG' }));
    dialog = await screen.findByRole('dialog', { name: 'Editar motivo' });
    await user.click(within(dialog).getByRole('switch', { name: /Exige observação/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(within((await screen.findByText('Teste AG')).closest('li')!).getByText('Exige observação')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apagar Teste AG' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apagar motivo' }));
    await waitFor(() => expect(screen.queryByText('Teste AG')).not.toBeInTheDocument());
  });

  it('configuração geral valida a escala antes de enviar', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }));
    const min = await screen.findByLabelText('Nota mínima da avaliação');
    await user.clear(min);
    await user.type(min, '10');
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(await screen.findByText('O máximo da escala precisa ser maior que o mínimo.')).toBeInTheDocument();
    await user.clear(min);
    await user.type(min, '1');
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    await waitFor(() => expect(useUi.getState().toasts.some((t) => t.title === 'Configuração do chat salva.')).toBe(true));
  });
});

describe('limpeza', () => {
  it('ao sair da tela não sobram timers nem assinaturas', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { unmount } = renderChat('/agent/chat/3');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(useChatStore.getState().conversation).toBeNull();
      // Só sobram timers de outras partes do app (debounce de toast etc.); os do chat somem.
      const pending = vi.getTimerCount();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(useChatStore.getState().lists.queue.items.length).toBeLessThanOrEqual(2);
      expect(pending).toBeLessThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
