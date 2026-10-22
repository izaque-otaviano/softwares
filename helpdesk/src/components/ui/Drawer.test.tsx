import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/store/useUi';
import { Drawer } from './Drawer';
import { TagInput } from './TagInput';
import { ToastViewport } from './Toast';

interface HarnessProps {
  description?: string;
  footer?: ReactNode;
  width?: string;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

function Harness({ description, footer, width, onOpenChange, children }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir filtros
      </button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title="Filtrar tickets"
        description={description}
        footer={footer}
        width={width}
      >
        {children ?? <input aria-label="Assunto" />}
      </Drawer>
    </div>
  );
}

const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

afterEach(() => useUi.setState({ toasts: [] }));

describe('Drawer', () => {
  it('fica fechado até open=true e então expõe um dialog nomeado pelo título', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filtrar tickets' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Filtrar tickets' })).toBeInTheDocument();
  });

  it('liga a descrição via aria-describedby e omite o atributo quando não há descrição', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness description="Refine a lista de tickets." />);
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleDescription('Refine a lista de tickets.');
    unmount();

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    expect(await screen.findByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('o foco inicial vai para o primeiro campo do corpo, não para o botão Fechar', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByLabelText('Assunto')).toHaveFocus());
  });

  it('com um TagInput já preenchido no topo, o foco inicial vai para o campo e não para o "Remover tag" de um chip', async () => {
    // Os botões "Remover" dos chips ficam fora da ordem de Tab: Enter/Espaço logo ao abrir não apagam uma tag por engano.
    const user = userEvent.setup();
    render(
      <Harness>
        <TagInput aria-label="Tags" value={['vip', 'urgente']} onChange={() => {}} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Tags' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Remover tag vip' })).not.toHaveFocus();
  });

  it('sem nada focável no corpo, o foco inicial fica dentro do drawer (no botão Fechar)', async () => {
    const user = userEvent.setup();
    render(<Harness>Somente leitura</Harness>);
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus());
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('Esc fecha e devolve o foco ao botão que abriu', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', { name: 'Abrir filtros' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('devolve o foco ao gatilho também quando aberto pelo teclado', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    const trigger = screen.getByRole('button', { name: 'Abrir filtros' });
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('o botão "Fechar" fecha o drawer e devolve o foco', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir filtros' });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('clique fora (no scrim) fecha', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const dialog = await screen.findByRole('dialog');
    await tick(); // o Radix registra o ouvinte de "clique fora" num setTimeout(0)
    await user.click(dialog.previousElementSibling as HTMLElement); // o scrim
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('prende o foco: Tab e Shift+Tab ciclam só entre os elementos do drawer', async () => {
    const user = userEvent.setup();
    render(
      <Harness footer={<button type="button">Aplicar filtros</button>}>
        <input aria-label="Assunto" />
        <input aria-label="Solicitante" />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const dialog = await screen.findByRole('dialog');
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 8; i += 1) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('renderiza o rodapé fixo apenas quando informado', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness footer={<button type="button">Aplicar filtros</button>} />);
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    expect(await screen.findByRole('button', { name: 'Aplicar filtros' })).toBeInTheDocument();
    unmount();

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Aplicar filtros' })).not.toBeInTheDocument();
  });

  it('usa a largura w-right por padrão e aceita outra classe de largura', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    expect(await screen.findByRole('dialog')).toHaveClass('w-right');
    unmount();

    render(<Harness width="w-props" />);
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveClass('w-props');
    expect(dialog).not.toHaveClass('w-right');
  });

  it('clicar num toast aberto por cima não fecha o drawer, mas clicar em outro lugar fora fecha', async () => {
    // O Radix deixa o <body> com pointer-events: none; o toast reativa isso via CSS, que o jsdom não carrega.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <>
        <Harness />
        <p>Texto de fundo</p>
        <ToastViewport />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    await screen.findByRole('dialog');
    act(() => {
      useUi.getState().pushToast({ tone: 'error', title: 'Falha ao aplicar', duration: 0 });
    });
    await tick();
    await user.click(screen.getByText('Falha ao aplicar'));
    await tick();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByText('Texto de fundo'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
