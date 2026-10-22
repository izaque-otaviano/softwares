import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Field } from './Field';
import { Combobox } from './Combobox';
import { Input } from './Input';
import { Select } from './Select';
import { TagInput } from './TagInput';
import { Textarea } from './Textarea';

describe('Field', () => {
  it('liga o rótulo ao controle (clicar no rótulo foca o campo)', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Assunto">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Assunto' });
    expect(input).toHaveAttribute('id');
    expect(screen.getByText('Assunto')).toHaveAttribute('for', input.id);
    await user.click(screen.getByText('Assunto'));
    expect(input).toHaveFocus();
  });

  it('obrigatório: asterisco escondido dos leitores de tela e aria-required no controle', () => {
    render(
      <Field label="Atribuído" required>
        <Input />
      </Field>,
    );
    const star = screen.getByText('*');
    expect(star).toHaveAttribute('aria-hidden', 'true');
    // O nome acessível não inclui o asterisco.
    expect(screen.getByRole('textbox', { name: 'Atribuído' })).toHaveAttribute('aria-required', 'true');
  });

  it('dica e erro entram no aria-describedby e o erro marca o campo como inválido', () => {
    render(
      <Field label="E-mail" hint="Usamos para avisar o cliente." error="Informe um e-mail válido.">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'E-mail' });
    const hint = screen.getByText('Usamos para avisar o cliente.');
    const error = screen.getByText('Informe um e-mail válido.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toEqual(expect.arrayContaining([hint.id, error.id]));
    expect(error.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  it('sem erro não marca aria-invalid nem referencia o erro', () => {
    render(
      <Field label="Nome" hint="Como aparece para o cliente.">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Nome' });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('Como aparece para o cliente.').id);
  });

  it('respeita id e aria-describedby que o filho já tinha', () => {
    render(
      <Field label="Descrição" error="Muito curta.">
        <Textarea id="minha-descricao" aria-describedby="externo" />
      </Field>,
    );
    const textarea = screen.getByRole('textbox', { name: 'Descrição' });
    expect(textarea).toHaveAttribute('id', 'minha-descricao');
    expect(textarea.getAttribute('aria-describedby')?.split(' ')).toContain('externo');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });

  it('funciona com elemento DOM como filho (aria-invalid direto)', () => {
    render(
      <Field label="Cor" error="Escolha uma cor.">
        <input />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Cor' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('renderiza a ação à direita do rótulo', () => {
    render(
      <Field label="Atribuído" labelAction={<a href="#aceitar">aceitar</a>}>
        <Input />
      </Field>,
    );
    expect(screen.getByRole('link', { name: 'aceitar' })).toBeInTheDocument();
  });

  it('liga rótulo, dica e erro também em Select, Combobox e TagInput', () => {
    render(
      <div>
        <Field label="Prioridade" hint="Dica do select" error="Erro do select" required>
          <Select value={undefined} onValueChange={() => undefined} options={[{ value: 'a', label: 'A' }]} />
        </Field>
        <Field label="Solicitante" hint="Dica do combo" error="Erro do combo" required>
          <Combobox value={null} onValueChange={() => undefined} options={[{ value: 'a', label: 'A' }]} />
        </Field>
        <Field label="Tags" hint="Dica das tags" error="Erro das tags" required>
          <TagInput value={[]} onChange={() => undefined} />
        </Field>
      </div>,
    );
    for (const [role, name, hint, error] of [
      ['combobox', 'Prioridade', 'Dica do select', 'Erro do select'],
      ['combobox', 'Solicitante', 'Dica do combo', 'Erro do combo'],
      ['textbox', 'Tags', 'Dica das tags', 'Erro das tags'],
    ] as const) {
      const control = screen.getByRole(role, { name });
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(control).toHaveAttribute('aria-required', 'true');
      expect(control.getAttribute('aria-describedby')?.split(' ')).toEqual(
        expect.arrayContaining([screen.getByText(hint).id, screen.getByText(error).id]),
      );
    }
  });
});
