import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('digita e repassa atributos nativos ao input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input aria-label="Buscar" placeholder="Pesquisar" name="q" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Buscar' });
    expect(input).toHaveAttribute('name', 'q');
    expect(input).toHaveAttribute('placeholder', 'Pesquisar');
    await user.type(input, 'ab');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue('ab');
  });

  it('invalid marca aria-invalid e a borda de perigo', () => {
    render(<Input aria-label="Nome" invalid />);
    const input = screen.getByRole('textbox', { name: 'Nome' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.parentElement).toHaveClass('border-danger');
  });

  it('sem invalid não tem aria-invalid', () => {
    render(<Input aria-label="Nome" />);
    expect(screen.getByRole('textbox', { name: 'Nome' })).not.toHaveAttribute('aria-invalid');
  });

  it('encaminha a ref ao input e mescla className no contêiner', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Nome" className="w-48" />);
    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Nome' }));
    expect(ref.current?.parentElement).toHaveClass('w-48', 'h-8');
  });

  it('mostra ícone decorativo e o slot à direita', () => {
    render(
      <Input
        aria-label="Buscar"
        leadingIcon={<svg data-testid="lupa" />}
        trailingSlot={<button type="button">Limpar</button>}
      />,
    );
    expect(screen.getByTestId('lupa').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeInTheDocument();
  });

  it('clicar no contêiner (fora do input) foca o input', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Buscar" leadingIcon={<svg data-testid="lupa" />} />);
    await user.click(screen.getByTestId('lupa').parentElement as HTMLElement);
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveFocus();
  });

  it('disabled desabilita o input', () => {
    render(<Input aria-label="Nome" disabled />);
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeDisabled();
  });
});
