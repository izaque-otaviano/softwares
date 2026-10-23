import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusDot } from './StatusDot';

describe('StatusDot', () => {
  it('sem label é decorativo (aria-hidden)', () => {
    const { container } = render(<StatusDot color="open" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('com label expõe o texto só para leitor de tela', () => {
    render(<StatusDot color="open" label="Aberto" />);
    const text = screen.getByText('Aberto');
    expect(text).toHaveClass('sr-only');
    expect(text.parentElement).not.toHaveAttribute('aria-hidden');
  });

  it('pinta status pelo token, nunca por hex direto', () => {
    const { container } = render(<StatusDot color="pending" />);
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe('var(--status-pending)');
  });

  it('é uma bolinha de 10 x 10', () => {
    const { container } = render(<StatusDot color="solved" />);
    expect(container.firstElementChild).toHaveClass('h-2.5', 'w-2.5', 'rounded-full');
  });

  it.each([
    ['available', 'bg-presence-available'],
    ['away', 'bg-presence-away'],
    ['dnd', 'bg-presence-dnd'],
    ['offline', 'bg-presence-offline'],
  ] as const)('presença %s usa %s', (presence, cls) => {
    const { container } = render(<StatusDot presence={presence} />);
    expect(container.firstElementChild).toHaveClass(cls);
  });

  it('sem cor nem presença cai para offline (cinza)', () => {
    const { container } = render(<StatusDot />);
    expect(container.firstElementChild).toHaveClass('bg-presence-offline');
  });

  it('color tem prioridade sobre presence', () => {
    const { container } = render(<StatusDot color="open" presence="available" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toHaveClass('bg-sla-text');
    expect(el.style.backgroundColor).toBe('var(--status-open)');
  });
});
