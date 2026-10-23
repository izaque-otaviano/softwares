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
    ['available', 'bg-sla-text'],
    ['away', 'bg-note-badge'],
    ['offline', 'bg-fg-subtle'],
  ] as const)('presença %s usa %s', (presence, cls) => {
    const { container } = render(<StatusDot presence={presence} />);
    expect(container.firstElementChild).toHaveClass(cls);
  });

  it('presença "ausente" ganha contorno escuro de 1px para atingir 3:1 sobre o fundo (o âmbar sozinho tem 2:1)', () => {
    const { container } = render(<StatusDot presence="away" />);
    expect(container.firstElementChild).toHaveClass('border', 'border-note-badgeText', 'h-2.5', 'w-2.5');
    const available = render(<StatusDot presence="available" />).container.firstElementChild;
    expect(available).not.toHaveClass('border');
  });

  it('sem cor nem presença cai para offline (cinza)', () => {
    const { container } = render(<StatusDot />);
    expect(container.firstElementChild).toHaveClass('bg-fg-subtle');
  });

  it('color tem prioridade sobre presence', () => {
    const { container } = render(<StatusDot color="open" presence="available" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toHaveClass('bg-sla-text');
    expect(el.style.backgroundColor).toBe('var(--status-open)');
  });
});
