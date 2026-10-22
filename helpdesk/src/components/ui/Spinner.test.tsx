import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('anuncia "Carregando..." em role=status', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando...');
    expect(screen.getByText('Carregando...')).toHaveClass('sr-only');
  });

  it('label customizado', () => {
    render(<Spinner label="Salvando" />);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Salvando');
  });

  it('label vazio deixa o spinner decorativo', () => {
    const { container } = render(<Spinner label="" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('o ícone é aria-hidden, gira e herda a cor', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('animate-spin');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('size em px (padrão 16)', () => {
    const { container, rerender } = render(<Spinner />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
    rerender(<Spinner size={24} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '24');
    expect(container.querySelector('svg')).toHaveAttribute('height', '24');
  });

  it('mescla className', () => {
    render(<Spinner className="text-fg-muted" />);
    expect(screen.getByRole('status')).toHaveClass('text-fg-muted');
  });
});
