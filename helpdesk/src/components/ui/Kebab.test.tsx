import { createRef } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Kebab } from './Kebab';
import type { MenuItemSpec } from './Menu';

const item = (id: string, extra: Partial<MenuItemSpec> = {}): MenuItemSpec => ({ id, label: id, onSelect: () => {}, ...extra });

describe('Kebab', () => {
  it('tem o nome acessível padrão "Mais ações" e anuncia que abre um menu', () => {
    render(<Kebab items={[item('Editar')]} />);
    const btn = screen.getByRole('button', { name: 'Mais ações' });
    expect(btn).toHaveAttribute('aria-haspopup', 'menu');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('aceita um label personalizado', () => {
    render(<Kebab label="Ações do ticket 42" items={[item('Editar')]} />);
    expect(screen.getByRole('button', { name: 'Ações do ticket 42' })).toBeInTheDocument();
  });

  it('abre com o mouse, lista os itens e executa a seleção fechando o menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Kebab items={[item('Editar', { onSelect }), item('Duplicar')]} />);
    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Mais ações' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(menu).getByRole('menuitem', { name: 'Editar' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it.each([['{Enter}'], [' '], ['{ArrowDown}']])('abre com o teclado (%j) e foca o primeiro item', async (keys) => {
    const user = userEvent.setup();
    render(<Kebab items={[item('Editar'), item('Duplicar')]} />);
    await user.tab();
    await user.keyboard(keys);
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Editar' })).toHaveFocus());
  });

  it('Esc fecha o menu e devolve o foco ao botão', async () => {
    const user = userEvent.setup();
    render(<Kebab items={[item('Editar')]} />);
    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais ações' })).toHaveFocus());
  });

  it('clique fora fecha o menu', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Kebab items={[item('Editar')]} />
        <p>Fora</p>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    await screen.findByRole('menu');
    await user.click(screen.getByText('Fora'));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('clique fora no "nada" devolve o foco ao botão; clique em outro controle deixa o foco com ele', async () => {
    // O Radix (menu não modal) não devolve o foco ao gatilho no clique fora; sem isto o foco caía no <body>.
    const user = userEvent.setup();
    render(
      <div>
        <Kebab items={[item('Editar')]} />
        <p>Fora</p>
        <button type="button">Outro</button>
      </div>,
    );
    const kebab = screen.getByRole('button', { name: 'Mais ações' });
    await user.click(kebab);
    await screen.findByRole('menu');
    await user.click(screen.getByText('Fora'));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(kebab).toHaveFocus());

    await user.click(kebab);
    await screen.findByRole('menu');
    await user.click(screen.getByRole('button', { name: 'Outro' }));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('button', { name: 'Outro' })).toHaveFocus();
  });

  it('itens danger ficam no final, depois de um divisor', async () => {
    const user = userEvent.setup();
    render(<Kebab items={[item('Excluir', { tone: 'danger' }), item('Editar'), item('Duplicar')]} />);
    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    const menu = await screen.findByRole('menu');
    expect(Array.from(menu.children).map((el) => el.getAttribute('role'))).toEqual(['menuitem', 'menuitem', 'separator', 'menuitem']);
    const items = within(menu).getAllByRole('menuitem');
    expect(items[2]).toHaveTextContent('Excluir');
    expect(items[2]).toHaveClass('text-danger');
  });

  it('disabled impede a abertura', async () => {
    const user = userEvent.setup();
    render(<Kebab disabled items={[item('Editar')]} />);
    const btn = screen.getByRole('button', { name: 'Mais ações' });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('sem itens o botão fica desabilitado', () => {
    render(<Kebab items={[]} />);
    expect(screen.getByRole('button', { name: 'Mais ações' })).toBeDisabled();
  });

  it('cliques e Enter no botão e no menu não chegam ao contêiner (linha clicável)', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onRowKeyDown = vi.fn();
    const onSelect = vi.fn();
    render(
      // Contêiner que simula uma linha de tabela clicável.
      <div role="row" tabIndex={0} onClick={onRowClick} onKeyDown={onRowKeyDown}>
        <Kebab items={[item('Editar', { onSelect })]} />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Editar' }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    screen.getByRole('button', { name: 'Mais ações' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{Enter}');

    expect(onRowClick).not.toHaveBeenCalled();
    expect(onRowKeyDown).not.toHaveBeenCalled();
  });

  it('encaminha ref e className ao botão', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Kebab ref={ref} className="ml-auto" size="sm" items={[item('Editar')]} />);
    const btn = screen.getByRole('button', { name: 'Mais ações' });
    expect(ref.current).toBe(btn);
    expect(btn).toHaveClass('ml-auto', 'h-6', 'w-6');
  });
});
