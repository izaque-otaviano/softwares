import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonRows, SkeletonText } from './Skeleton';

describe('Skeleton', () => {
  it('é um bloco decorativo de cor chapada, sem gradiente nem animação', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild!;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveClass('bg-surface-2', 'rounded');
    expect([...el.classList].some((c) => /gradient|animate|shimmer/.test(c))).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('aceita width/height em número (px) ou string', () => {
    const { container } = render(<Skeleton width={120} height="2rem" />);
    expect(container.firstElementChild).toHaveStyle({ width: '120px', height: '2rem' });
  });

  it('altura padrão de 12px (uma linha de texto)', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveStyle({ height: '12px' });
  });

  it('respeita altura vinda de classe h-*', () => {
    const { container } = render(<Skeleton className="h-8 w-24" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.height).toBe('');
    expect(el).toHaveClass('h-8', 'w-24');
  });

  it('circle é redondo e tem 32px por padrão', () => {
    const { container } = render(<Skeleton circle />);
    const el = container.firstElementChild!;
    expect(el).toHaveClass('rounded-pill');
    expect(el).toHaveStyle({ width: '32px', height: '32px' });
  });

  it('circle com tamanho próprio', () => {
    const { container } = render(<Skeleton circle width={40} height={40} />);
    expect(container.firstElementChild).toHaveStyle({ width: '40px', height: '40px' });
  });
});

describe('SkeletonText', () => {
  it('anuncia "Carregando..." uma vez, em role=status', () => {
    render(<SkeletonText />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Carregando...');
    expect(screen.getByText('Carregando...')).toHaveClass('sr-only');
  });

  it('3 linhas por padrão, todas aria-hidden, a última mais curta', () => {
    const { container } = render(<SkeletonText />);
    const blocks = container.querySelectorAll<HTMLElement>('[data-skeleton]');
    expect(blocks).toHaveLength(3);
    blocks.forEach((b) => expect(b).toHaveAttribute('aria-hidden', 'true'));
    expect(blocks[0]!.style.width).toBe('100%');
    expect(blocks[2]!.style.width).toBe('60%');
  });

  it('aceita lines, label e className', () => {
    const { container } = render(<SkeletonText lines={5} label="Buscando resumo" className="w-48" />);
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(5);
    expect(screen.getByRole('status')).toHaveTextContent('Buscando resumo');
    expect(screen.getByRole('status')).toHaveClass('w-48');
  });

  it('uma linha só ocupa a largura toda', () => {
    const { container } = render(<SkeletonText lines={1} />);
    expect((container.querySelector('[data-skeleton]') as HTMLElement).style.width).toBe('100%');
  });
});

describe('SkeletonRows', () => {
  it('5 linhas x 4 colunas por padrão, com um único anúncio de carregamento', () => {
    const { container } = render(<SkeletonRows />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando...');
    const rows = container.querySelectorAll('[data-skeleton-row]');
    expect(rows).toHaveLength(5);
    rows.forEach((row) => expect(row.querySelectorAll('[data-skeleton]')).toHaveLength(4));
  });

  it('aceita rows e columns', () => {
    const { container } = render(<SkeletonRows rows={2} columns={7} />);
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(14);
  });

  it('as linhas são decorativas e têm a altura de uma linha de dados (40px)', () => {
    const { container } = render(<SkeletonRows rows={1} />);
    const row = container.querySelector('[data-skeleton-row]')!;
    expect(row).toHaveAttribute('aria-hidden', 'true');
    expect(row).toHaveClass('h-10');
  });

  it('larguras determinísticas: duas renderizações dão o mesmo resultado', () => {
    const widths = () => {
      const { container, unmount } = render(<SkeletonRows rows={3} columns={3} />);
      const w = Array.from(container.querySelectorAll<HTMLElement>('[data-skeleton]')).map((e) => e.style.width);
      unmount();
      return w;
    };
    expect(widths()).toEqual(widths());
  });
});
