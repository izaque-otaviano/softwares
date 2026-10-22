import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Menu, MenuContent, MenuItem, MenuItems, MenuLabel, MenuSeparator, MenuTrigger, normalizeMenuItems, type MenuItemSpec } from './Menu';

const spec = (id: string, extra: Partial<MenuItemSpec> = {}): MenuItemSpec => ({ id, label: id, onSelect: () => {}, ...extra });

function Harness({ items }: { items: MenuItemSpec[] }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button">Abrir</button>
      </MenuTrigger>
      <MenuContent aria-label="Ações">
        <MenuItems items={items} />
      </MenuContent>
    </Menu>
  );
}

async function openWithKeyboard(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole('button', { name: 'Abrir' }).focus();
  await user.keyboard('{Enter}');
  return screen.findByRole('menu');
}

describe('normalizeMenuItems', () => {
  it('mantém a ordem e não começa com divisor', () => {
    const out = normalizeMenuItems([spec('a', { separatorBefore: true }), spec('b'), spec('c', { separatorBefore: true })]);
    expect(out.map((o) => [o.item.id, o.separator])).toEqual([
      ['a', false],
      ['b', false],
      ['c', true],
    ]);
  });

  it('empurra itens danger para o final e coloca divisor antes do primeiro', () => {
    const out = normalizeMenuItems([spec('excluir', { tone: 'danger' }), spec('editar'), spec('apagar', { tone: 'danger' }), spec('copiar')]);
    expect(out.map((o) => o.item.id)).toEqual(['editar', 'copiar', 'excluir', 'apagar']);
    expect(out.map((o) => o.separator)).toEqual([false, false, true, false]);
  });

  it('não gera divisor quando o item danger é o único', () => {
    expect(normalizeMenuItems([spec('excluir', { tone: 'danger' })]).map((o) => o.separator)).toEqual([false]);
  });

  it('não duplica divisor quando o danger também pede separatorBefore', () => {
    const out = normalizeMenuItems([spec('a'), spec('x', { tone: 'danger', separatorBefore: true })]);
    expect(out.map((o) => o.separator)).toEqual([false, true]);
  });
});

describe('Menu', () => {
  it('abre com o teclado, expõe papéis ARIA e foca o primeiro item', async () => {
    const user = userEvent.setup();
    render(<Harness items={[spec('Editar'), spec('Duplicar')]} />);
    const menu = await openWithKeyboard(user);
    expect(menu).toBeInTheDocument();
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Editar', 'Duplicar']);
    await waitFor(() => expect(items[0]).toHaveFocus());
  });

  it('navega com as setas e seleciona com Enter, fechando o menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness items={[spec('Editar'), spec('Duplicar', { onSelect })]} />);
    await openWithKeyboard(user);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('Esc fecha e devolve o foco ao gatilho', async () => {
    const user = userEvent.setup();
    render(<Harness items={[spec('Editar')]} />);
    await openWithKeyboard(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus());
  });

  it('item danger vem sempre depois de um divisor, mesmo sem separatorBefore', async () => {
    const user = userEvent.setup();
    render(<Harness items={[spec('Excluir', { tone: 'danger' }), spec('Editar'), spec('Duplicar')]} />);
    const menu = await openWithKeyboard(user);
    const children = Array.from(menu.children).map((el) => el.getAttribute('role') ?? '');
    expect(children).toEqual(['menuitem', 'menuitem', 'separator', 'menuitem']);
    const items = within(menu).getAllByRole('menuitem');
    expect(items[items.length - 1]).toHaveTextContent('Excluir');
    expect(items[items.length - 1]).toHaveClass('text-danger');
    expect(items[0]).not.toHaveClass('text-danger');
  });

  it('respeita separatorBefore em itens comuns', async () => {
    const user = userEvent.setup();
    render(<Harness items={[spec('A'), spec('B', { separatorBefore: true }), spec('C')]} />);
    const menu = await openWithKeyboard(user);
    expect(Array.from(menu.children).map((el) => el.getAttribute('role'))).toEqual(['menuitem', 'separator', 'menuitem', 'menuitem']);
  });

  it('itens marcáveis usam menuitemcheckbox com aria-checked', async () => {
    const user = userEvent.setup();
    render(<Harness items={[spec('Visível', { checked: true }), spec('Oculto', { checked: false })]} />);
    await openWithKeyboard(user);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Visível' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Oculto' })).toHaveAttribute('aria-checked', 'false');
  });

  it('item desabilitado fica aria-disabled e não dispara onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness items={[spec('Bloqueado', { disabled: true, onSelect }), spec('Livre')]} />);
    await openWithKeyboard(user);
    const blocked = screen.getByRole('menuitem', { name: 'Bloqueado' });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await user.click(blocked);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('mostra ícone e atalho sem poluir o nome acessível do ícone', async () => {
    const user = userEvent.setup();
    render(<Harness items={[spec('Responder', { shortcut: 'Ctrl+R', icon: <svg data-testid="ico" /> })]} />);
    await openWithKeyboard(user);
    const item = screen.getByRole('menuitem');
    expect(item).toHaveTextContent('Responder');
    expect(item).toHaveTextContent('Ctrl+R');
    expect(screen.getByTestId('ico').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('primitivos soltos: MenuLabel e MenuSeparator compõem grupos', async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger asChild>
          <button type="button">Abrir</button>
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>Ordenar por</MenuLabel>
          <MenuItem>Data</MenuItem>
          <MenuSeparator />
          <MenuItem tone="danger">Limpar</MenuItem>
        </MenuContent>
      </Menu>,
    );
    await openWithKeyboard(user);
    expect(screen.getByText('Ordenar por')).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Limpar' })).toHaveClass('text-danger');
  });
});
