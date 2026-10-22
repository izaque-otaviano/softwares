import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('mostra título e descrição', () => {
    render(<EmptyState title="Nenhum ticket nesta visualização" description="Tente outros filtros." />);
    expect(screen.getByText('Nenhum ticket nesta visualização')).toBeInTheDocument();
    expect(screen.getByText('Tente outros filtros.')).toHaveClass('text-fg-muted');
  });

  it('descrição e ação são opcionais', () => {
    const { container } = render(<EmptyState title="Vazio" />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it.each(['box', 'search', 'binoculars'] as const)('renderiza a ilustração %s', (name) => {
    const { container } = render(<EmptyState illustration={name} title="x" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('data-illustration', name);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('a ilustração padrão é a caixa vazia', () => {
    const { container } = render(<EmptyState title="x" />);
    expect(container.querySelector('svg')).toHaveAttribute('data-illustration', 'box');
  });

  it('a ilustração é decorativa, de traço fino e sem preenchimento', () => {
    const { container } = render(<EmptyState illustration="search" title="x" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('stroke-width', '1.5');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('viewBox', '0 0 96 96');
    expect(svg).toHaveClass('text-fg-subtle');
  });

  it('as três ilustrações são desenhos diferentes', () => {
    const paths = (name: 'box' | 'search' | 'binoculars') => {
      const { container, unmount } = render(<EmptyState illustration={name} title="x" />);
      const html = container.querySelector('svg')!.innerHTML;
      unmount();
      return html;
    };
    const all = [paths('box'), paths('search'), paths('binoculars')];
    expect(new Set(all).size).toBe(3);
    all.forEach((html) => expect(html.length).toBeGreaterThan(100));
  });

  it('nenhuma ilustração usa cor fixa ou preenchimento', () => {
    for (const name of ['box', 'search', 'binoculars'] as const) {
      const { container, unmount } = render(<EmptyState illustration={name} title="x" />);
      const html = container.querySelector('svg')!.outerHTML;
      expect(html).not.toMatch(/#[0-9a-f]{3,6}|rgb\(|fill="(?!none)/i);
      unmount();
    }
  });

  it('renderiza a ação e ela funciona pelo teclado', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<EmptyState title="x" action={<button onClick={onClick}>Criar ticket</button>} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Criar ticket' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a ação fica centralizada', () => {
    render(<EmptyState title="x" action={<button>Ir</button>} />);
    expect(screen.getByRole('button').parentElement).toHaveClass('justify-center');
  });

  it('compact reduz espaçamento, ilustração e título', () => {
    const { container, rerender } = render(<EmptyState title="Título" />);
    const normal = container.firstElementChild!;
    expect(normal).toHaveClass('py-12');
    expect(screen.getByText('Título')).toHaveClass('text-md', 'font-semibold');
    expect(container.querySelector('svg')).toHaveAttribute('width', '96');

    rerender(<EmptyState title="Título" compact />);
    expect(container.firstElementChild).toHaveClass('py-6');
    expect(container.firstElementChild).not.toHaveClass('py-12');
    expect(screen.getByText('Título')).toHaveClass('text-sm', 'font-semibold');
    expect(container.querySelector('svg')).toHaveAttribute('width', '64');
  });

  it('mescla className', () => {
    const { container } = render(<EmptyState title="x" className="h-full" />);
    expect(container.firstElementChild).toHaveClass('h-full', 'flex-col');
  });
});
