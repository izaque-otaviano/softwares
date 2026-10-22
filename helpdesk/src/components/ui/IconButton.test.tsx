import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

const Icon = () => <svg data-testid="icon" />;

describe('IconButton', () => {
  it('usa label como aria-label e esconde o ícone dos leitores de tela', () => {
    render(<IconButton label="Fechar" icon={<Icon />} />);
    const btn = screen.getByRole('button', { name: 'Fechar' });
    expect(btn).toHaveAttribute('aria-label', 'Fechar');
    expect(btn).toHaveAttribute('type', 'button');
    expect(screen.getByTestId('icon').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('funciona sem TooltipProvider externo e mostra o Tooltip com o label ao focar pelo teclado', async () => {
    const user = userEvent.setup();
    render(<IconButton label="Mais ações" icon={<Icon />} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Mais ações' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Mais ações');
  });

  it('o Tooltip inclui o atalho quando informado e fecha com Esc', async () => {
    const user = userEvent.setup();
    render(<IconButton label="Início" shortcut="g h" icon={<Icon />} />);
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('g h');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('dispara onClick com mouse e teclado', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton label="Copiar" icon={<Icon />} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('disabled não dispara onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton label="Copiar" icon={<Icon />} disabled onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('pressed controla aria-pressed; sem a prop o atributo não existe', () => {
    const { rerender } = render(<IconButton label="Negrito" icon={<Icon />} />);
    expect(screen.getByRole('button', { name: 'Negrito' })).not.toHaveAttribute('aria-pressed');
    rerender(<IconButton label="Negrito" icon={<Icon />} pressed={false} />);
    expect(screen.getByRole('button', { name: 'Negrito' })).toHaveAttribute('aria-pressed', 'false');
    rerender(<IconButton label="Negrito" icon={<Icon />} pressed />);
    expect(screen.getByRole('button', { name: 'Negrito' })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each(['ghost', 'outline', 'ink'] as const)('%s pressed troca fundo e cor do texto sem classes concorrentes', (variant) => {
    // Sem tailwind-merge, duas utilities de fundo (ou de cor de texto) no mesmo elemento disputam pela ordem do CSS gerado:
    // o repouso vencia o pressionado e o alternador ghost ficava idêntico ao desligado. Garante que o conjunto emitido
    // para cada estado tem no máximo UM fundo e UMA cor de texto, e que pressed muda os dois (ou ao menos o fundo).
    const { rerender } = render(<IconButton label="Negrito" icon={<Icon />} variant={variant} pressed={false} />);
    const rest = [...screen.getByRole('button', { name: 'Negrito' }).classList];
    rerender(<IconButton label="Negrito" icon={<Icon />} variant={variant} pressed />);
    const pressed = [...screen.getByRole('button', { name: 'Negrito' }).classList];

    const plain = (classes: string[]) => classes.filter((c) => !c.includes(':'));
    const backgrounds = (classes: string[]) => plain(classes).filter((c) => c.startsWith('bg-'));
    const textColors = (classes: string[]) => plain(classes).filter((c) => /^text-(fg|action|danger|ink)/.test(c));

    for (const classes of [rest, pressed]) {
      expect(backgrounds(classes)).toHaveLength(1);
      expect(textColors(classes)).toHaveLength(1);
    }
    expect(backgrounds(pressed)).not.toEqual(backgrounds(rest));
    expect(backgrounds(pressed)[0]).not.toBe('bg-transparent');
    if (variant === 'ghost') expect(textColors(pressed)).not.toEqual(textColors(rest));
  });

  it('tamanhos sm (24px) e md (32px)', () => {
    const { rerender } = render(<IconButton label="A" icon={<Icon />} size="sm" />);
    expect(screen.getByRole('button')).toHaveClass('h-6', 'w-6');
    rerender(<IconButton label="A" icon={<Icon />} />);
    expect(screen.getByRole('button')).toHaveClass('h-8', 'w-8');
  });

  it('encaminha ref, className e atributos nativos (serve de filho asChild)', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<IconButton ref={ref} label="Abrir" icon={<Icon />} className="ml-2" aria-expanded={false} aria-haspopup="menu" />);
    const btn = screen.getByRole('button', { name: 'Abrir' });
    expect(ref.current).toBe(btn);
    expect(btn).toHaveClass('ml-2');
    expect(btn).toHaveAttribute('aria-haspopup', 'menu');
  });
});
