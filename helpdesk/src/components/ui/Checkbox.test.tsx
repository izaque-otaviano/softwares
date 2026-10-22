import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

function Harness({ initial = false }: { initial?: boolean | 'indeterminate' }) {
  const [checked, setChecked] = useState<boolean | 'indeterminate'>(initial);
  return <Checkbox checked={checked} onCheckedChange={setChecked} label="Selecionar tudo" />;
}

describe('Checkbox', () => {
  it('alterna ao clicar no quadrado e no rótulo', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('checkbox', { name: 'Selecionar tudo' });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(box).toBeChecked();
    await user.click(screen.getByText('Selecionar tudo'));
    expect(box).not.toBeChecked();
  });

  it('alterna com a barra de espaço quando focado', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} aria-label="Linha 3" />);
    await user.tab();
    expect(screen.getByRole('checkbox', { name: 'Linha 3' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('indeterminate: aplica a propriedade do DOM e fica parcialmente marcado', () => {
    render(<Checkbox checked="indeterminate" onCheckedChange={() => undefined} aria-label="Todos" />);
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Todos' });
    expect(box.indeterminate).toBe(true);
    expect(box.checked).toBe(false);
    expect(box).toBePartiallyChecked();
  });

  it('clicar em indeterminate marca (true) e limpa o estado misto', async () => {
    const user = userEvent.setup();
    render(<Harness initial="indeterminate" />);
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Selecionar tudo' });
    expect(box).toBePartiallyChecked();
    await user.click(box);
    expect(box.indeterminate).toBe(false);
    expect(box).toBeChecked();
  });

  it('disabled não dispara onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} label="Bloqueado" disabled />);
    const box = screen.getByRole('checkbox', { name: 'Bloqueado' });
    expect(box).toBeDisabled();
    await user.click(box);
    await user.click(screen.getByText('Bloqueado'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('encaminha ref e className (no label)', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox ref={ref} checked onCheckedChange={() => undefined} aria-label="X" className="ml-2" />);
    expect(ref.current).toBe(screen.getByRole('checkbox', { name: 'X' }));
    expect(ref.current?.closest('label')).toHaveClass('ml-2');
  });
});
