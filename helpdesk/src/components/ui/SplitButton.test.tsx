import { createRef } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SplitButton, type SplitButtonProps, type SplitItem } from './SplitButton';

const ITEMS: SplitItem[] = [
  { id: 'open', label: 'Enviar como Aberto', leading: <span data-testid="dot-open" />, description: 'Mantém na fila da equipe' },
  { id: 'pending', label: 'Enviar como Pendente', leading: <span data-testid="dot-pending" /> },
  { id: 'solved', label: 'Enviar como Resolvido', separatorBefore: true },
  { id: 'locked', label: 'Enviar como Bloqueado', disabled: true },
];

function setup(props: Partial<SplitButtonProps> = {}) {
  const onClick = vi.fn();
  const onSelectItem = vi.fn();
  const utils = render(<SplitButton label="Enviar como Em andamento" onClick={onClick} items={ITEMS} onSelectItem={onSelectItem} {...props} />);
  return { onClick, onSelectItem, ...utils };
}

const arrow = (name = 'Mais opções de envio') => screen.getByRole('button', { name });

describe('SplitButton', () => {
  it('o botão principal dispara onClick e a seta tem aria-label padrão', async () => {
    const user = userEvent.setup();
    const { onClick } = setup();
    await user.click(screen.getByRole('button', { name: 'Enviar como Em andamento' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(arrow()).toHaveAttribute('aria-haspopup', 'menu');
    expect(arrow()).toHaveAttribute('aria-expanded', 'false');
  });

  it('aceita menuLabel personalizado', () => {
    setup({ menuLabel: 'Escolher status de envio' });
    expect(arrow('Escolher status de envio')).toBeInTheDocument();
  });

  it.each([['{Enter}'], [' '], ['{ArrowDown}'], ['{ArrowUp}']])('a seta abre o menu com o teclado (%j)', async (keys) => {
    const user = userEvent.setup();
    setup();
    arrow().focus();
    await user.keyboard(keys);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(4);
    expect(arrow()).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Enviar como Aberto' })).toHaveFocus());
  });

  it('a seta abre com o mouse', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(arrow());
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('Esc fecha o menu e devolve o foco à seta', async () => {
    const user = userEvent.setup();
    setup();
    arrow().focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(arrow()).toHaveFocus());
  });

  it('clique fora fecha o menu', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <SplitButton label="Enviar" onClick={() => {}} items={ITEMS} onSelectItem={() => {}} />
        <p>Fora</p>
      </div>,
    );
    await user.click(arrow());
    await screen.findByRole('menu');
    await user.click(screen.getByText('Fora'));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('escolher um item chama onSelectItem com o item, fecha o menu e não aciona o botão principal', async () => {
    const user = userEvent.setup();
    const { onSelectItem, onClick } = setup();
    arrow().focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    expect(onSelectItem).toHaveBeenCalledWith(ITEMS[1]);
    expect(onClick).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('mostra leading e description; a descrição não entra no nome acessível do item', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(arrow());
    const item = await screen.findByRole('menuitem', { name: 'Enviar como Aberto' });
    expect(within(item).getByTestId('dot-open')).toBeInTheDocument();
    expect(within(item).getByText('Mantém na fila da equipe')).toBeInTheDocument();
    expect(item).toHaveAccessibleDescription('Mantém na fila da equipe');
    expect(screen.getByTestId('dot-pending')).toBeInTheDocument();
  });

  it('separatorBefore gera divisor e item desabilitado não é selecionável', async () => {
    const user = userEvent.setup();
    const { onSelectItem } = setup();
    await user.click(arrow());
    const menu = await screen.findByRole('menu');
    expect(Array.from(menu.children).map((el) => el.getAttribute('role'))).toEqual(['menuitem', 'menuitem', 'separator', 'menuitem', 'menuitem']);
    const locked = within(menu).getByRole('menuitem', { name: 'Enviar como Bloqueado' });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    await user.click(locked);
    expect(onSelectItem).not.toHaveBeenCalled();
  });

  it('size md (padrão) tem 32px e lg tem 40px, com a seta quadrada da mesma altura', () => {
    const { unmount } = setup();
    const main = screen.getByRole('button', { name: 'Enviar como Em andamento' });
    expect(main).toHaveClass('h-8', 'px-3');
    expect(arrow()).toHaveClass('h-8', 'w-8');
    unmount();

    setup({ size: 'lg' });
    const mainLg = screen.getByRole('button', { name: 'Enviar como Em andamento' });
    expect(mainLg).toHaveClass('h-10', 'px-4');
    expect(mainLg).not.toHaveClass('h-8');
    expect(arrow()).toHaveClass('h-10', 'w-10');
    expect(arrow()).not.toHaveClass('w-8');
  });

  it('o menu prefere abrir para cima por padrão e aceita side="bottom"', async () => {
    const user = userEvent.setup();
    const first = setup();
    await user.click(arrow());
    expect(await screen.findByRole('menu')).toHaveAttribute('data-side', 'top');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    first.unmount();

    setup({ side: 'bottom' });
    await user.click(arrow());
    expect(await screen.findByRole('menu')).toHaveAttribute('data-side', 'bottom');
  });

  it('loading bloqueia o clique principal e a abertura do menu, mantendo o foco na seta', async () => {
    const user = userEvent.setup();
    const { onClick } = setup({ loading: true });
    const main = screen.getByRole('button', { name: 'Enviar como Em andamento' });
    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(main).not.toBeDisabled();
    await user.click(main);
    expect(onClick).not.toHaveBeenCalled();

    arrow().focus();
    await user.keyboard('{Enter}{ArrowDown}{ArrowUp}');
    await user.click(arrow());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(arrow()).toHaveFocus();
  });

  it('disabled desabilita os dois botões', async () => {
    const user = userEvent.setup();
    const { onClick } = setup({ disabled: true });
    const main = screen.getByRole('button', { name: 'Enviar como Em andamento' });
    expect(main).toBeDisabled();
    expect(arrow()).toBeDisabled();
    await user.click(main);
    await user.click(arrow());
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('variant define as cores (ink por padrão, primary opcional)', () => {
    const { unmount } = setup();
    expect(screen.getByRole('button', { name: 'Enviar como Em andamento' })).toHaveClass('bg-ink');
    unmount();
    setup({ variant: 'primary' });
    expect(screen.getByRole('button', { name: 'Enviar como Em andamento' })).toHaveClass('bg-action');
    expect(arrow()).toHaveClass('bg-action');
  });

  it('className vai para o contêiner e ref para o botão principal', () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(
      <SplitButton ref={ref} className="ml-auto" label="Enviar" onClick={() => {}} items={ITEMS} onSelectItem={() => {}} />,
    );
    expect(container.firstElementChild).toHaveClass('ml-auto');
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Enviar' }));
  });
});
