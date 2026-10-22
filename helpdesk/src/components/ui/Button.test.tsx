import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('é type="button" por padrão e usa a variante outline md', () => {
    render(<Button>Cancelar</Button>);
    const btn = screen.getByRole('button', { name: 'Cancelar' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveClass('h-8', 'border-line-strong', 'bg-surface');
  });

  it.each([
    ['primary', 'bg-action'],
    ['ink', 'bg-ink'],
    ['ghost', 'bg-transparent'],
    ['danger', 'bg-danger'],
  ] as const)('variante %s usa o token %s', (variant, cls) => {
    render(<Button variant={variant}>Ok</Button>);
    expect(screen.getByRole('button')).toHaveClass(cls);
  });

  it('size lg tem 40px de altura', () => {
    render(<Button size="lg">Enviar</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-10');
  });

  it('dispara onClick com mouse, Enter e Espaço', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    const btn = screen.getByRole('button', { name: 'Salvar' });
    await user.click(btn);
    btn.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('disabled não dispara onClick e usa cursor-not-allowed sem hover', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Salvar
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Salvar' });
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass('cursor-not-allowed', 'opacity-50');
    expect(btn.className).not.toContain('hover:bg-action-hover');
  });

  it('loading bloqueia o clique, marca aria-busy e mantém o nome acessível', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="ink" loading onClick={onClick}>
        Enviar
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Enviar' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
    expect(btn.className).not.toContain('hover:bg-ink-active');
  });

  it('loading não envia o formulário', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          Criar
        </Button>
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('fora de loading, type="submit" envia o formulário', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Criar</Button>
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sem loading não renderiza spinner nem aria-busy', () => {
    const { container } = render(<Button>Ok</Button>);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
    expect(container.querySelector('svg.animate-spin')).toBeNull();
  });

  it('loading mostra o spinner escondido dos leitores de tela', () => {
    const { container } = render(<Button loading>Ok</Button>);
    const spinner = container.querySelector('svg.animate-spin');
    expect(spinner).not.toBeNull();
    expect(spinner?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('ícones laterais são decorativos (aria-hidden) e não entram no nome acessível', () => {
    render(
      <Button leadingIcon={<svg data-testid="lead" />} trailingIcon={<svg data-testid="trail" />}>
        Novo ticket
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Novo ticket' })).toBeInTheDocument();
    expect(screen.getByTestId('lead').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByTestId('trail').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('encaminha ref, className e atributos nativos', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} className="w-full" aria-label="Aplicar filtros" data-x="1">
        Aplicar
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Aplicar filtros' });
    expect(ref.current).toBe(btn);
    expect(btn).toHaveClass('w-full');
    expect(btn).toHaveAttribute('data-x', '1');
  });
});
