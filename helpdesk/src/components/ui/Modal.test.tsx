import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/store/useUi';
import { ConfirmModal, Modal, type ModalSize } from './Modal';
import { Table, type ColumnDef } from './Table';
import { ToastViewport } from './Toast';

const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

afterEach(() => useUi.setState({ toasts: [] }));

interface ModalHarnessProps {
  size?: ModalSize;
  description?: string;
  footer?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}

function ModalHarness({ size, description, footer, onOpenChange }: ModalHarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Novo cliente
      </button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title="Adicionar cliente"
        description={description}
        size={size}
        footer={footer}
      >
        <input aria-label="Nome" />
      </Modal>
    </div>
  );
}

describe('Modal', () => {
  it('abre como dialog modal nomeado pelo título', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar cliente' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  it('liga a descrição quando existe e omite aria-describedby quando não existe', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ModalHarness description="Preencha os dados básicos." />);
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    expect(await screen.findByRole('dialog')).toHaveAccessibleDescription('Preencha os dados básicos.');
    unmount();

    render(<ModalHarness />);
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    expect(await screen.findByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('o foco inicial vai para o primeiro campo do corpo', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus());
  });

  it('onOpenAutoFocus personalizado substitui o foco inicial', async () => {
    const user = userEvent.setup();
    function Custom() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <Modal
            open={open}
            onOpenChange={setOpen}
            title="Personalizado"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('segundo')?.focus();
            }}
          >
            <input aria-label="Primeiro" />
            <input id="segundo" aria-label="Segundo" />
          </Modal>
        </>
      );
    }
    render(<Custom />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByLabelText('Segundo')).toHaveFocus());
  });

  it('Esc fecha e o foco volta ao gatilho', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ModalHarness onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', { name: 'Novo cliente' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('o botão "Fechar" fecha e o foco volta ao gatilho', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Novo cliente' });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('clique fora fecha', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ModalHarness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    const dialog = await screen.findByRole('dialog');
    await tick(); // o Radix registra o ouvinte de "clique fora" num setTimeout(0)
    await user.click(dialog.previousElementSibling as HTMLElement); // o scrim
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('prende o foco dentro do modal', async () => {
    const user = userEvent.setup();
    render(<ModalHarness footer={<button type="button">Salvar</button>} />);
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    const dialog = await screen.findByRole('dialog');
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('renderiza o rodapé apenas quando informado', async () => {
    const user = userEvent.setup();
    render(<ModalHarness footer={<button type="button">Salvar</button>} />);
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    expect(await screen.findByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it.each<[ModalSize | undefined, string]>([
    [undefined, 'max-w-xl'],
    ['sm', 'max-w-sm'],
    ['md', 'max-w-xl'],
    ['lg', 'max-w-3xl'],
  ])('tamanho %s usa %s e raio 8', async (size, cls) => {
    const user = userEvent.setup();
    render(<ModalHarness size={size} />);
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveClass(cls, 'rounded-lg');
  });

  it('devolve o foco ao gatilho de um menu quando o modal foi aberto por um item do menu', async () => {
    const user = userEvent.setup();
    function FromMenu() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>Ações</DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content>
                <DropdownMenu.Item onSelect={() => setOpen(true)}>Apagar ticket</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <ConfirmModal
            open={open}
            onOpenChange={setOpen}
            title="Apagar ticket?"
            confirmLabel="Apagar"
            onConfirm={() => {}}
          />
        </>
      );
    }
    render(<FromMenu />);
    const trigger = screen.getByRole('button', { name: 'Ações' });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Apagar ticket' }));
    await screen.findByRole('dialog', { name: 'Apagar ticket?' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('clicar num toast aberto por cima não fecha o modal, mas clicar em outro lugar fora fecha', async () => {
    // O Radix deixa o <body> com pointer-events: none; o toast reativa isso via CSS, que o jsdom não carrega.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <>
        <ModalHarness />
        <p>Texto de fundo</p>
        <ToastViewport />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    await screen.findByRole('dialog');
    act(() => {
      useUi.getState().pushToast({ tone: 'error', title: 'Falha ao salvar', duration: 0 });
    });
    await tick();
    await user.click(screen.getByText('Falha ao salvar'));
    await tick();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByText('Texto de fundo'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

/* -------------------------------------------------------------------------- */

interface ConfirmHarnessProps {
  onConfirm?: () => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
  tone?: 'danger' | 'primary';
  description?: string;
  cancelLabel?: string;
  loading?: boolean;
}

function ConfirmHarness({ onConfirm = () => {}, onOpenChange, tone, description, cancelLabel, loading }: ConfirmHarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Apagar ticket
      </button>
      <ConfirmModal
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title="Apagar o ticket #12?"
        description={description}
        confirmLabel="Apagar ticket"
        cancelLabel={cancelLabel}
        tone={tone}
        onConfirm={onConfirm}
        loading={loading}
      />
    </div>
  );
}

const openConfirm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Apagar ticket' }));
  return screen.findByRole('dialog', { name: 'Apagar o ticket #12?' });
};

describe('ConfirmModal', () => {
  it('Confirmar chama onConfirm uma vez e fecha', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} onOpenChange={onOpenChange} />);
    const dialog = await openConfirm(user);
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Apagar ticket')!;
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Cancelar não chama onConfirm e fecha', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} onOpenChange={onOpenChange} />);
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Esc não confirma', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} />);
    await openConfirm(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('no tom danger o foco inicial vai para Cancelar e Enter cancela', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} />);
    await openConfirm(user);
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('no tom primary o foco inicial vai para a confirmação', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmHarness tone="primary" onConfirm={onConfirm} />);
    const dialog = await openConfirm(user);
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Apagar ticket')!;
    await waitFor(() => expect(confirm).toHaveFocus());
    expect(confirm).toHaveClass('bg-action');
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('o botão de confirmação destrutiva é vermelho (bg-danger) e usa o rótulo informado', async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness cancelLabel="Voltar" description="Esta ação não pode ser desfeita." />);
    const dialog = await openConfirm(user);
    expect(dialog).toHaveAccessibleDescription('Esta ação não pode ser desfeita.');
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Apagar ticket')!;
    expect(confirm).toHaveClass('bg-danger', 'text-fg-inverse');
  });

  it('com onConfirm assíncrono fica ocupado até resolver, ignora cliques extras e Esc, e então fecha', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const onOpenChange = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} onOpenChange={onOpenChange} />);
    const dialog = await openConfirm(user);
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Apagar ticket')!;
    await user.click(confirm);
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(confirm).toHaveAttribute('aria-disabled', 'true');

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => resolve());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('se onConfirm rejeitar, o modal continua aberto e volta ao estado normal', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => Promise.reject(new Error('falhou')));
    render(<ConfirmHarness onConfirm={onConfirm} />);
    const dialog = await openConfirm(user);
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Apagar ticket')!;
    await user.click(confirm);
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-busy'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('loading controlado pelo pai bloqueia a confirmação', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} loading />);
    const dialog = await openConfirm(user);
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Apagar ticket')!;
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('devolve o foco ao gatilho depois de fechar', async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness />);
    const trigger = screen.getByRole('button', { name: 'Apagar ticket' });
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('ConfirmModal: gatilho apagado junto com a linha', () => {
  interface Row {
    id: string;
    name: string;
  }
  const COLUMNS: ColumnDef<Row>[] = [{ id: 'name', header: 'Nome', cell: (r) => r.name, width: 200 }];

  function Apagar() {
    const [rows, setRows] = useState<Row[]>([
      { id: '1', name: 'Ticket A' },
      { id: '2', name: 'Ticket B' },
    ]);
    const [pending, setPending] = useState<Row | null>(null);
    return (
      <>
        <button type="button">Fora da tabela</button>
        <Table<Row>
          id="apagar"
          aria-label="Tickets"
          columns={COLUMNS}
          rows={rows}
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.name}
          rowActions={(row) => [{ id: 'apagar', label: 'Apagar', tone: 'danger', onSelect: () => setPending(row) }]}
        />
        <ConfirmModal
          open={pending !== null}
          onOpenChange={(open) => !open && setPending(null)}
          title="Apagar ticket?"
          confirmLabel="Apagar ticket"
          onConfirm={() => {
            setRows((current) => current.filter((r) => r.id !== pending?.id));
            setPending(null);
          }}
        />
      </>
    );
  }

  it('Kebab > Apagar > confirmar: a linha some e o foco vai para o grupo da tabela (não para o <body>)', async () => {
    const user = userEvent.setup();
    render(<Apagar />);
    await user.click(screen.getByRole('button', { name: 'Mais ações: Ticket A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Apagar' }));
    await screen.findByRole('dialog', { name: 'Apagar ticket?' });
    await user.click(screen.getByRole('button', { name: 'Apagar ticket' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Ticket A')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('group', { name: 'Tickets' })).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it('cancelar mantém a linha e devolve o foco ao kebab da própria linha', async () => {
    const user = userEvent.setup();
    render(<Apagar />);
    const kebab = screen.getByRole('button', { name: 'Mais ações: Ticket B' });
    await user.click(kebab);
    await user.click(await screen.findByRole('menuitem', { name: 'Apagar' }));
    await screen.findByRole('dialog', { name: 'Apagar ticket?' });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(kebab).toHaveFocus());
  });
});
