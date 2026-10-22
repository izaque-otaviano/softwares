import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AA_NORMAL, contrastRatio } from './colorContrast';
import { Pill, type PillTone } from './Pill';
import { classColors } from './testTokens';

const TONES: PillTone[] = ['neutral', 'action', 'danger', 'note', 'ai'];

describe('Pill', () => {
  it('renderiza o texto com raio total e 12px', () => {
    render(<Pill>VIP</Pill>);
    const root = screen.getByText('VIP').parentElement!;
    expect(root).toHaveClass('rounded-pill', 'text-xs');
  });

  it('sem onRemove não tem botão', () => {
    render(<Pill>VIP</Pill>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('com onRemove mostra o botão com nome acessível padrão', async () => {
    const onRemove = vi.fn();
    render(<Pill onRemove={onRemove}>VIP</Pill>);
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('removeLabel específico vira o nome acessível', () => {
    render(
      <Pill onRemove={() => {}} removeLabel="Remover tag vip">
        vip
      </Pill>,
    );
    expect(screen.getByRole('button', { name: 'Remover tag vip' })).toBeInTheDocument();
  });

  it('remover funciona pelo teclado (Tab, Enter e Espaço)', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Pill onRemove={onRemove}>VIP</Pill>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Remover' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it('o botão de remover tem alvo de 24 x 24', () => {
    render(<Pill onRemove={() => {}}>VIP</Pill>);
    expect(screen.getByRole('button')).toHaveClass('h-6', 'w-6');
  });

  it('ícone é decorativo', () => {
    render(<Pill icon={<svg data-testid="ic" />}>VIP</Pill>);
    expect(screen.getByTestId('ic').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('mescla className e repassa atributos', () => {
    render(<Pill className="mr-1" data-testid="p">VIP</Pill>);
    expect(screen.getByTestId('p')).toHaveClass('mr-1', 'rounded-pill');
  });

  it.each(TONES)('tom %s: contraste AA, sem gradiente nem sombra', (tone) => {
    render(<Pill tone={tone}>t</Pill>);
    const root = screen.getByText('t').parentElement!;
    const { bg, text } = classColors(root);
    expect(contrastRatio(text!, bg!)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(root.className).not.toMatch(/gradient|shadow/);
  });
});
