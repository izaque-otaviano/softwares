import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useUi } from '@/store/useUi';
import { ToastViewport } from './Toast';

beforeEach(() => {
  useUi.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
  useUi.setState({ toasts: [] });
});

const region = () => screen.getByRole('region', { name: 'Notificações' });

describe('ToastViewport', () => {
  it('mantém uma região aria-live="polite" no DOM mesmo sem toasts', () => {
    render(<ToastViewport />);
    const r = region();
    expect(r).toHaveAttribute('aria-live', 'polite');
    expect(r).toBeEmptyDOMElement();
  });

  it('fica no canto superior direito, abaixo da topbar, e deixa o resto da página clicável', () => {
    render(<ToastViewport />);
    expect(region()).toHaveClass('fixed', 'top-topbar', 'right-4', 'pointer-events-none');
    expect(region()).not.toHaveClass('bottom-4');
    expect(region()).toHaveAttribute('aria-keyshortcuts', 'F8');
  });

  it('mostra o toast disparado por toast.success() dentro da região aria-live', () => {
    render(<ToastViewport />);
    act(() => {
      toast.success('Ticket #2 foi criado', { description: 'Você pode editá-lo a qualquer momento.' });
    });
    expect(within(region()).getByText('Ticket #2 foi criado')).toBeInTheDocument();
    expect(within(region()).getByText('Você pode editá-lo a qualquer momento.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erros usam role="alert"; sucesso e informação não', () => {
    render(<ToastViewport />);
    act(() => {
      toast.info('Sincronizando');
      toast.error('Não foi possível salvar');
    });
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Não foi possível salvar');
    expect(alerts[0]).toHaveAttribute('data-tone', 'error');
    expect(within(region()).getByText('Sincronizando').closest('[data-tone]')).toHaveAttribute('data-tone', 'info');
  });

  it('o botão de fechar remove o toast', async () => {
    const user = userEvent.setup();
    render(<ToastViewport />);
    act(() => {
      toast.success('Ticket #2 foi atualizado', { duration: 0 });
    });
    await user.click(screen.getByRole('button', { name: 'Fechar notificação' }));
    expect(screen.queryByText('Ticket #2 foi atualizado')).not.toBeInTheDocument();
    expect(useUi.getState().toasts).toHaveLength(0);
  });

  it('o botão de fechar é alcançável e acionável pelo teclado', async () => {
    const user = userEvent.setup();
    render(<ToastViewport />);
    act(() => {
      toast.info('Dica', { duration: 0 });
    });
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fechar notificação' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByText('Dica')).not.toBeInTheDocument();
  });

  it('a ação opcional é executada e fecha o toast', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ToastViewport />);
    act(() => {
      toast.success('Ticket apagado', { action: { label: 'Desfazer', onClick }, duration: 0 });
    });
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Ticket apagado')).not.toBeInTheDocument();
  });

  it('mostra no máximo 4 toasts, mantendo os mais recentes', () => {
    render(<ToastViewport />);
    act(() => {
      for (let i = 1; i <= 6; i += 1) toast.info(`Aviso ${i}`, { duration: 0 });
    });
    expect(screen.getAllByRole('button', { name: 'Fechar notificação' })).toHaveLength(4);
    expect(screen.queryByText('Aviso 2')).not.toBeInTheDocument();
    expect(screen.getByText('Aviso 3')).toBeInTheDocument();
    expect(screen.getByText('Aviso 6')).toBeInTheDocument();
  });

  it('usa apenas tokens: faixa e ícone por tom', () => {
    render(<ToastViewport />);
    act(() => {
      toast.success('ok', { duration: 0 });
      toast.error('erro', { duration: 0 });
      toast.info('info', { duration: 0 });
    });
    const html = region().innerHTML;
    expect(html).toContain('bg-sla-text');
    expect(html).toContain('bg-danger');
    expect(html).toContain('bg-action');
    expect(html).toContain('shadow-pop');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
});

describe('ToastViewport: fechamento por tempo (timers falsos)', () => {
  it('fecha sozinho depois de 4s por padrão', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => {
      toast.success('Ticket #2 foi criado');
    });
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.getByText('Ticket #2 foi criado')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Ticket #2 foi criado')).not.toBeInTheDocument();
    expect(useUi.getState().toasts).toHaveLength(0);
  });

  it('respeita uma duração própria', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => {
      toast.info('Rápido', { duration: 1000 });
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByText('Rápido')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Rápido')).not.toBeInTheDocument();
  });

  it('erro não fecha sozinho por padrão (fica até o usuário fechar), mas aceita uma duração própria', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => {
      toast.error('Falha ao salvar');
      toast.error('Falha temporária', { duration: 1000 });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Falha ao salvar')).toBeInTheDocument();
    expect(screen.queryByText('Falha temporária')).not.toBeInTheDocument();
  });

  it('duration 0 fica até o usuário fechar', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => {
      toast.error('Fica', { duration: 0 });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Fica')).toBeInTheDocument();
  });

  it('cada toast tem o seu próprio relógio', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => {
      toast.info('Primeiro', { duration: 2000 });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      toast.info('Segundo', { duration: 2000 });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Primeiro')).not.toBeInTheDocument();
    expect(screen.getByText('Segundo')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Segundo')).not.toBeInTheDocument();
  });

  it('pausa ao passar o mouse e retoma com o tempo restante', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => {
      toast.success('Pausável');
    });
    const card = screen.getByText('Pausável').closest('[data-tone]')!;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Pausável')).toBeInTheDocument();

    fireEvent.mouseLeave(card);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByText('Pausável')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Pausável')).not.toBeInTheDocument();
  });

  it('pausa enquanto o foco está dentro do toast e retoma ao sair', () => {
    vi.useFakeTimers();
    render(
      <>
        <button type="button">Fora</button>
        <ToastViewport />
      </>,
    );
    act(() => {
      toast.info('Com foco');
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const close = screen.getByRole('button', { name: 'Fechar notificação' });
    act(() => close.focus());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Com foco')).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Fora' }).focus());
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByText('Com foco')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Com foco')).not.toBeInTheDocument();
  });

  it('mover o foco entre elementos do mesmo toast não retoma o timer', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => {
      toast.success('Dois botões', { action: { label: 'Desfazer', onClick: () => {} } });
    });
    const action = screen.getByRole('button', { name: 'Desfazer' });
    const close = screen.getByRole('button', { name: 'Fechar notificação' });
    act(() => action.focus());
    act(() => close.focus());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Dois botões')).toBeInTheDocument();
  });

  it('limpa os timers ao desmontar', () => {
    vi.useFakeTimers();
    const { unmount } = render(<ToastViewport />);
    act(() => {
      toast.info('A');
      toast.info('B');
    });
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fechar manualmente cancela o timer daquele toast', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => {
      toast.info('Único');
    });
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar notificação' }));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ToastViewport: teclado e foco', () => {
  function setup() {
    const onUndo = vi.fn();
    render(
      <>
        <button type="button">Fora</button>
        <ToastViewport />
      </>,
    );
    return { onUndo };
  }

  it('F8 leva o foco ao primeiro controle do primeiro toast, mesmo que ele seja o último elemento do DOM', async () => {
    const user = userEvent.setup();
    const { onUndo } = setup();
    act(() => {
      toast.success('Ticket #2 foi criado', { action: { label: 'Desfazer', onClick: onUndo } });
    });
    screen.getByRole('button', { name: 'Fora' }).focus();
    await user.keyboard('{F8}');
    expect(screen.getByRole('button', { name: 'Desfazer' })).toHaveFocus();
  });

  it('F8 sem nenhum toast não faz nada', async () => {
    const user = userEvent.setup();
    setup();
    const outside = screen.getByRole('button', { name: 'Fora' });
    outside.focus();
    await user.keyboard('{F8}');
    expect(outside).toHaveFocus();
  });

  it('Esc no toast focado fecha o toast e devolve o foco a quem o tinha antes do F8', async () => {
    const user = userEvent.setup();
    setup();
    act(() => {
      toast.info('Sincronizando', { duration: 0 });
    });
    const outside = screen.getByRole('button', { name: 'Fora' });
    outside.focus();
    await user.keyboard('{F8}');
    expect(screen.getByRole('button', { name: 'Fechar notificação' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Sincronizando')).not.toBeInTheDocument();
    await waitFor(() => expect(outside).toHaveFocus());
  });

  it('fechar com Enter no botão X também devolve o foco (não o deixa no <body>)', async () => {
    const user = userEvent.setup();
    setup();
    act(() => {
      toast.info('Com X', { duration: 0 });
    });
    const outside = screen.getByRole('button', { name: 'Fora' });
    outside.focus();
    await user.tab(); // de "Fora" para o X do toast (próximo na ordem do DOM)
    expect(screen.getByRole('button', { name: 'Fechar notificação' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByText('Com X')).not.toBeInTheDocument();
    await waitFor(() => expect(outside).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it('a ação do toast (ex.: Desfazer) dispara e fecha o toast sem perder o foco', async () => {
    const user = userEvent.setup();
    const { onUndo } = setup();
    act(() => {
      toast.success('Removido', { duration: 0, action: { label: 'Desfazer', onClick: onUndo } });
    });
    screen.getByRole('button', { name: 'Fora' }).focus();
    await user.keyboard('{F8}');
    await user.keyboard('{Enter}');
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Removido')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fora' })).toHaveFocus());
  });
});
