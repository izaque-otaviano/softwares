import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AA_NORMAL, contrastRatio } from './colorContrast';
import { Combobox } from './Combobox';
import { Input } from './Input';
import { Select } from './Select';
import { TagInput } from './TagInput';
import { Textarea } from './Textarea';
import { colorOfClass, tokenHex } from './testTokens';

/** Cor do placeholder declarada por classe (`placeholder:text-*` ou `data-[placeholder]:text-*`) ou pela própria classe `text-*`. */
function placeholderColor(el: Element, kind: 'pseudo' | 'data' | 'own'): string {
  const prefix = kind === 'pseudo' ? 'placeholder:' : kind === 'data' ? 'data-[placeholder]:' : '';
  const hit = Array.from(el.classList)
    .filter((c) => c.startsWith(`${prefix}text-`) && !c.slice(prefix.length).startsWith('text-sm') && !c.slice(prefix.length).startsWith('text-xs'))
    .map((c) => colorOfClass('text', c.slice(prefix.length)))
    .find(Boolean);
  if (!hit) throw new Error(`Sem cor de placeholder em: ${el.className}`);
  return hit;
}

// Campos com fundo `surface`; o placeholder precisa de AA (4,5:1) como qualquer texto (a exceção da WCAG é só para desabilitado).
const SURFACE = tokenHex('surface');

describe('placeholders passam de AA (4,5:1) sobre o fundo do campo', () => {
  it('Input', () => {
    render(<Input aria-label="Nome" placeholder="Digite o nome" />);
    expect(contrastRatio(placeholderColor(screen.getByRole('textbox'), 'pseudo'), SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('Textarea', () => {
    render(<Textarea aria-label="Obs" placeholder="Escreva" />);
    expect(contrastRatio(placeholderColor(screen.getByRole('textbox'), 'pseudo'), SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('TagInput', () => {
    render(<TagInput aria-label="Tags" value={[]} onChange={() => {}} placeholder="Adicionar tag" />);
    expect(contrastRatio(placeholderColor(screen.getByRole('textbox'), 'pseudo'), SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('Select (valor vazio)', () => {
    render(<Select aria-label="Prioridade" value={undefined} onValueChange={() => {}} options={[{ value: 'a', label: 'A' }]} placeholder="Selecione" />);
    expect(contrastRatio(placeholderColor(screen.getByRole('combobox'), 'data'), SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('Combobox (gatilho e campo de busca)', async () => {
    const user = userEvent.setup();
    render(<Combobox aria-label="Pessoa" value={null} onValueChange={() => {}} options={[{ value: 'a', label: 'Ana' }]} placeholder="Selecione" searchPlaceholder="Buscar" />);
    const trigger = screen.getByRole('combobox', { name: 'Pessoa' });
    const label = screen.getByText('Selecione');
    expect(contrastRatio(placeholderColor(label, 'own'), SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL);
    await user.click(trigger);
    const search = await screen.findByPlaceholderText('Buscar');
    expect(contrastRatio(placeholderColor(search, 'pseudo'), SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('o texto digitado (text-fg) continua mais escuro que o placeholder (text-fg-muted)', () => {
    expect(contrastRatio(tokenHex('fg'), SURFACE)).toBeGreaterThan(contrastRatio(tokenHex('fg.muted'), SURFACE));
  });

  it('Input desabilitado usa o texto subtle do contêiner desabilitado (não o text-fg escuro)', () => {
    render(<Input aria-label="Nome" defaultValue="Não editável" disabled />);
    expect(screen.getByRole('textbox')).toHaveClass('disabled:text-fg-subtle');
  });
});
