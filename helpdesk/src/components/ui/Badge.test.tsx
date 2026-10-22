import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AA_NORMAL, contrastRatio } from './colorContrast';
import { Badge, type BadgeTone } from './Badge';
import { classColors } from './testTokens';

const TONES: BadgeTone[] = ['neutral', 'action', 'danger', 'note', 'ai', 'success'];

describe('Badge', () => {
  it('renderiza o conteúdo e é neutro por padrão', () => {
    render(<Badge>Campo padrão</Badge>);
    const el = screen.getByText('Campo padrão');
    expect(el).toHaveAttribute('data-tone', 'neutral');
    expect(el).toHaveClass('text-xs', 'font-semibold', 'rounded');
  });

  it('não é interativo', () => {
    render(<Badge tone="action">Novo</Badge>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('size sm vira selo de 10px com raio 2', () => {
    render(<Badge size="sm" tone="note">Interno</Badge>);
    const el = screen.getByText('Interno');
    expect(el).toHaveClass('text-2xs', 'font-semibold', 'rounded-xs');
    expect(el).not.toHaveClass('text-xs');
  });

  it('mescla className', () => {
    render(<Badge className="ml-2">x</Badge>);
    expect(screen.getByText('x')).toHaveClass('ml-2', 'inline-flex');
  });

  it('repassa atributos nativos', () => {
    render(<Badge title="Dica" data-testid="b">x</Badge>);
    expect(screen.getByTestId('b')).toHaveAttribute('title', 'Dica');
  });

  it.each(TONES)('tom %s: texto com contraste AA sobre o fundo e sem gradiente', (tone) => {
    render(<Badge tone={tone}>t</Badge>);
    const el = screen.getByText('t');
    const { bg, text } = classColors(el);
    expect(bg).toBeDefined();
    expect(text).toBeDefined();
    expect(contrastRatio(text!, bg!)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(el.className).not.toMatch(/gradient|shadow/);
  });
});
