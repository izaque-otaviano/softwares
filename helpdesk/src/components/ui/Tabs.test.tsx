import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

function Example({ onValueChange }: { onValueChange?: (v: string) => void }) {
  return (
    <Tabs defaultValue="todos" onValueChange={onValueChange}>
      <TabsList aria-label="Tickets">
        <TabsTrigger value="todos" count={12}>
          Todos
        </TabsTrigger>
        <TabsTrigger value="abertos" count={0}>
          Abertos
        </TabsTrigger>
        <TabsTrigger value="relacionado">Relacionado</TabsTrigger>
      </TabsList>
      <TabsContent value="todos">Painel dos todos</TabsContent>
      <TabsContent value="abertos">Painel dos abertos</TabsContent>
      <TabsContent value="relacionado">Painel relacionado</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('expõe tablist, tab e tabpanel com os vínculos ARIA corretos', () => {
    render(<Example />);
    const list = screen.getByRole('tablist', { name: 'Tickets' });
    expect(list).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Painel dos todos');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0]!.id);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('mostra o contador entre parênteses no nome da aba, inclusive zero', () => {
    render(<Example />);
    expect(screen.getByRole('tab', { name: 'Todos (12)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Abertos (0)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Relacionado' })).toBeInTheDocument();
  });

  it('aceita contador em texto', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a" count="99+">
            Fila
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'Fila (99+)' })).toBeInTheDocument();
  });

  it('marca a aba ativa com a linha de 2px em action', () => {
    render(<Example />);
    const active = screen.getByRole('tab', { name: 'Todos (12)' });
    expect(active).toHaveAttribute('data-state', 'active');
    expect(active.className).toContain('border-b-2');
    expect(active.className).toContain('data-[state=active]:border-action');
    expect(screen.getByRole('tab', { name: 'Abertos (0)' })).toHaveAttribute('data-state', 'inactive');
  });

  it('navega com as setas, trocando o painel e movendo o foco', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);
    await user.tab();
    expect(screen.getByRole('tab', { name: 'Todos (12)' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Abertos (0)' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Abertos (0)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel dos abertos');
    expect(onValueChange).toHaveBeenLastCalledWith('abertos');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel relacionado');

    // volta ao início (navegação circular) e depois para trás
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Todos (12)' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Relacionado' })).toHaveFocus();
  });

  it('Home e End vão para a primeira e a última aba', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Relacionado' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Todos (12)' })).toHaveFocus();
  });

  it('o Tab sai da lista e leva ao painel (só a aba ativa é tabulável)', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    await user.tab();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
  });

  it('muda de aba ao clicar', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('tab', { name: 'Relacionado' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel relacionado');
    expect(screen.getByRole('tab', { name: 'Relacionado' })).toHaveAttribute('aria-selected', 'true');
  });

  it('funciona controlado e pula abas desabilitadas nas setas', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState('a');
      return (
        <Tabs value={value} onValueChange={setValue}>
          <TabsList aria-label="Controlado">
            <TabsTrigger value="a">A</TabsTrigger>
            <TabsTrigger value="b" disabled>
              B
            </TabsTrigger>
            <TabsTrigger value="c">C</TabsTrigger>
          </TabsList>
          <TabsContent value="a">conteúdo a</TabsContent>
          <TabsContent value="c">conteúdo c</TabsContent>
        </Tabs>
      );
    }
    render(<Controlled />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'C' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('conteúdo c');
    expect(screen.getByRole('tab', { name: 'B' })).toBeDisabled();
  });

  it('mescla className em cada parte e repassa a ref', () => {
    const triggerRef = { current: null as HTMLButtonElement | null };
    render(
      <Tabs defaultValue="a" className="minha-raiz">
        <TabsList className="minha-lista" aria-label="Classes">
          <TabsTrigger ref={triggerRef} value="a" className="meu-gatilho">
            A
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="meu-painel">
          x
        </TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tablist')).toHaveClass('minha-lista', 'border-b');
    expect(screen.getByRole('tab')).toHaveClass('meu-gatilho', 'h-10');
    expect(screen.getByRole('tabpanel')).toHaveClass('meu-painel');
    expect(triggerRef.current).toBe(screen.getByRole('tab'));
    expect(document.querySelector('.minha-raiz')).toBeInTheDocument();
  });
});
