import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';
import type { SelectOption } from './Select';

const OPTIONS: SelectOption[] = [
  { value: '', label: '—' },
  { value: 'low', label: 'Baixa' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente', disabled: true },
];

function Harness({ initial, onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <Select
      aria-label="Prioridade"
      placeholder="Selecione"
      options={OPTIONS}
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('Select', () => {
  it('mostra o placeholder quando value é undefined e o gatilho tem role=combobox', () => {
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Prioridade' });
    expect(trigger).toHaveTextContent('Selecione');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('mostra o rótulo da opção selecionada', () => {
    render(<Harness initial="high" />);
    expect(screen.getByRole('combobox', { name: 'Prioridade' })).toHaveTextContent('Alta');
  });

  it('abre pelo teclado, navega com as setas e escolhe com Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Prioridade' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(4);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('high');
    expect(trigger).toHaveTextContent('Alta');
  });

  it('abre com clique e escolhe uma opção com o mouse', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Prioridade' }));
    await user.click(await screen.findByRole('option', { name: 'Baixa' }));
    expect(onChange).toHaveBeenCalledWith('low');
  });

  it('Esc fecha a lista e devolve o foco ao gatilho', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Prioridade' });
    await user.click(trigger);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('a opção com value vazio ("—") é selecionável e devolve ""', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="low" onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Prioridade' }));
    await user.click(await screen.findByRole('option', { name: '—' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.getByRole('combobox', { name: 'Prioridade' })).toHaveTextContent('—');
  });

  it('opção desabilitada não pode ser escolhida', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Prioridade' }));
    const urgent = await screen.findByRole('option', { name: 'Urgente' });
    expect(urgent).toHaveAttribute('aria-disabled', 'true');
    await user.click(urgent);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('className vai para o contêiner (largura etc.) e a ref chega ao gatilho', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Select ref={ref} aria-label="Tipo" className="w-48" value={undefined} onValueChange={() => undefined} options={OPTIONS} />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Tipo' });
    expect(ref.current).toBe(trigger);
    expect(trigger.parentElement).toHaveClass('w-48');
  });

  it('invalid marca aria-invalid; disabled desabilita o gatilho', () => {
    const { rerender } = render(
      <Select aria-label="Tipo" value={undefined} onValueChange={() => undefined} options={OPTIONS} invalid />,
    );
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveAttribute('aria-invalid', 'true');
    rerender(<Select aria-label="Tipo" value={undefined} onValueChange={() => undefined} options={OPTIONS} disabled />);
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toBeDisabled();
  });
});
