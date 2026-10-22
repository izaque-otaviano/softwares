import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagInput } from './TagInput';
import type { TagInputProps } from './TagInput';

type HarnessProps = Partial<Omit<TagInputProps, 'value' | 'onChange'>> & {
  initial?: string[];
  onChange?: (tags: string[]) => void;
};

function Harness({ initial = [], onChange, ...rest }: HarnessProps) {
  const [tags, setTags] = useState<string[]>(initial);
  return (
    <TagInput
      aria-label="Tags"
      {...rest}
      value={tags}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
    />
  );
}

const chipLabels = () =>
  screen.queryAllByRole('button', { name: /^Remover tag / }).map((b) => b.getAttribute('aria-label')?.replace('Remover tag ', ''));

describe('TagInput', () => {
  it('Enter adiciona a tag e limpa o campo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.type(input, 'vip{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['vip']);
    expect(input).toHaveValue('');
    expect(chipLabels()).toEqual(['vip']);
  });

  it('vírgula adiciona a tag', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.type(input, 'urgente,');
    expect(onChange).toHaveBeenLastCalledWith(['urgente']);
    expect(input).toHaveValue('');
    await user.type(input, 'a,b,c');
    expect(chipLabels()).toEqual(['urgente', 'a', 'b']);
    expect(input).toHaveValue('c');
  });

  it('Tab com texto adiciona e mantém o foco no campo; Tab vazio segue o fluxo normal', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Harness />
        <button type="button">Depois</button>
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.type(input, 'faturamento');
    await user.tab();
    expect(chipLabels()).toEqual(['faturamento']);
    expect(input).toHaveFocus();
    // Campo vazio: o Tab segue o fluxo normal da página.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus();
  });

  it('Shift+Tab com texto sai do campo para trás e NÃO cria a tag', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <button type="button">Antes</button>
        <Harness onChange={onChange} suggestions={['vip', 'faturamento']} />
      </div>,
    );
    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.type(input, 'novatag');
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Antes' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    expect(chipLabels()).toEqual([]);
  });

  it('Tab com texto recusado por validate não prende o foco: sai do campo, mantém o texto e a mensagem', async () => {
    const user = userEvent.setup();
    const validate = (tag: string) => (tag.length < 3 ? 'Mínimo 3 letras.' : null);
    render(
      <div>
        <Harness validate={validate} />
        <button type="button">Depois</button>
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.type(input, 'ab');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus();
    expect(input).toHaveValue('ab');
    expect(chipLabels()).toEqual([]);
    expect(input).toHaveAccessibleDescription('Mínimo 3 letras.');
    // Shift+Tab também sai (volta ao campo e depois ao início da página, sem armadilha).
    await user.tab({ shift: true });
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(input).not.toHaveFocus();
  });

  it('Tab com texto no limite de maxTags não prende o foco', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Harness initial={['a', 'b']} maxTags={2} />
        <button type="button">Depois</button>
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.type(input, 'c');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus();
    expect(chipLabels()).toEqual(['a', 'b']);
    expect(input).toHaveAccessibleDescription('Máximo de 2 tags.');
  });

  it('Tab com sugestão ativa recusada (maxTags) também não prende o foco', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Harness initial={['a']} maxTags={1} suggestions={['abacaxi']} />
        <button type="button">Depois</button>
      </div>,
    );
    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.type(input, 'aba');
    await user.keyboard('{ArrowDown}');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus();
    expect(chipLabels()).toEqual(['a']);
  });

  it('os botões "Remover tag" ficam fora da ordem de Tab: o Tab entra direto no campo', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Antes</button>
        <Harness initial={['a', 'b', 'c']} />
      </div>,
    );
    screen.getByRole('button', { name: 'Antes' }).focus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Tags' })).toHaveFocus();
    // Continuam alcançáveis pelas setas e removíveis por teclado.
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Remover tag c' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Remover tag b' })).toHaveFocus();
  });

  it('Backspace no campo vazio remove a última tag; com texto só apaga o texto', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['a', 'b']} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.click(input);
    await user.type(input, 'x');
    await user.keyboard('{Backspace}');
    expect(onChange).not.toHaveBeenCalled();
    expect(chipLabels()).toEqual(['a', 'b']);

    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(['a']);
    expect(chipLabels()).toEqual(['a']);
  });

  it('ignora duplicatas (sem diferenciar maiúsculas/acentos) e limpa o campo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['Cliente']} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.type(input, 'cliente{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(chipLabels()).toEqual(['Cliente']);
    expect(input).toHaveValue('');
  });

  it('colar texto separa por vírgula, espaço e quebra de linha, sem duplicatas', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['a']} onChange={onChange} />);
    await user.click(screen.getByRole('textbox', { name: 'Tags' }));
    await user.paste('a, b c\nd,,e  b');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(chipLabels()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(screen.getByRole('textbox', { name: 'Tags' })).toHaveValue('');
  });

  it('colar um único trecho cola no campo, sem criar tag', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.click(input);
    await user.paste('unica');
    expect(input).toHaveValue('unica');
    expect(chipLabels()).toEqual([]);
  });

  it('cada chip tem o botão "Remover tag X" que remove e devolve o foco ao campo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['a', 'b', 'c']} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Remover tag b' }));
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c']);
    expect(chipLabels()).toEqual(['a', 'c']);
    expect(screen.getByRole('textbox', { name: 'Tags' })).toHaveFocus();
  });

  it('teclado nos chips: ← no campo vazio foca o último chip, setas andam e Backspace remove', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['a', 'b']} />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.click(input);
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Remover tag b' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Remover tag a' })).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(input).toHaveFocus();
    await user.keyboard('{ArrowLeft}{Backspace}');
    expect(chipLabels()).toEqual(['a']);
    expect(input).toHaveFocus();
  });

  it('validate recusa a tag, mantém o texto e mostra a mensagem', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const validate = (tag: string) => (tag.length < 3 ? 'Mínimo de 3 caracteres.' : null);
    render(<Harness validate={validate} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.type(input, 'ab{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('ab');
    expect(screen.getByText('Mínimo de 3 caracteres.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('Mínimo de 3 caracteres.').id);

    await user.type(input, 'c{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['abc']);
    expect(screen.queryByText('Mínimo de 3 caracteres.')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('maxTags impede passar do limite e avisa', async () => {
    const user = userEvent.setup();
    render(<Harness maxTags={2} initial={['a', 'b']} />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.type(input, 'c{Enter}');
    expect(chipLabels()).toEqual(['a', 'b']);
    expect(screen.getByText('Máximo de 2 tags.')).toBeInTheDocument();
  });

  it('placeholder só aparece sem tags; id vai para o input; invalid marca o campo', () => {
    const { rerender } = render(<TagInput value={[]} onChange={() => undefined} placeholder="Adicionar tag" id="tags" invalid />);
    const input = screen.getByPlaceholderText('Adicionar tag');
    expect(input).toHaveAttribute('id', 'tags');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    rerender(<TagInput value={['x']} onChange={() => undefined} placeholder="Adicionar tag" id="tags" />);
    expect(screen.queryByPlaceholderText('Adicionar tag')).not.toBeInTheDocument();
  });

  it('disabled desabilita o campo e os botões de remover', () => {
    render(<TagInput aria-label="Tags" value={['a']} onChange={() => undefined} disabled />);
    expect(screen.getByRole('textbox', { name: 'Tags' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remover tag a' })).toBeDisabled();
  });

  describe('sugestões', () => {
    const SUGGESTIONS = ['reembolso', 'recorrente', 'vip', 'faturamento'];

    it('abre a lista ao digitar, filtra, ignora as já usadas e oferece "Adicionar tag"', async () => {
      const user = userEvent.setup();
      render(<Harness suggestions={SUGGESTIONS} initial={['recorrente']} />);
      const input = screen.getByRole('combobox', { name: 'Tags' });
      expect(input).toHaveAttribute('aria-expanded', 'false');
      await user.type(input, 're');
      const listbox = await screen.findByRole('listbox', { name: 'Sugestões de tags' });
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(input).toHaveAttribute('aria-controls', listbox.id);
      const options = screen.getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['reembolso', 'Adicionar tag “re”']);
    });

    it('setas + Enter escolhem a sugestão; Enter sem destaque cria a tag digitada', async () => {
      const user = userEvent.setup();
      render(<Harness suggestions={SUGGESTIONS} />);
      const input = screen.getByRole('combobox', { name: 'Tags' });
      await user.type(input, 're');
      await screen.findByRole('listbox');
      await user.keyboard('{ArrowDown}');
      expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'reembolso' }).id);
      await user.keyboard('{Enter}');
      expect(chipLabels()).toEqual(['reembolso']);

      await user.type(input, 'novatag{Enter}');
      expect(chipLabels()).toEqual(['reembolso', 'novatag']);
    });

    it('clicar numa sugestão adiciona e mantém o foco no campo', async () => {
      const user = userEvent.setup();
      render(<Harness suggestions={SUGGESTIONS} />);
      const input = screen.getByRole('combobox', { name: 'Tags' });
      await user.type(input, 'vi');
      await user.click(await screen.findByRole('option', { name: 'vip' }));
      expect(chipLabels()).toEqual(['vip']);
      expect(input).toHaveFocus();
    });

    it('Esc fecha a lista; seta para baixo no campo vazio abre as sugestões', async () => {
      const user = userEvent.setup();
      render(<Harness suggestions={SUGGESTIONS} />);
      const input = screen.getByRole('combobox', { name: 'Tags' });
      await user.type(input, 'v');
      await screen.findByRole('listbox');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(input).toHaveFocus();

      await user.clear(input);
      await user.keyboard('{ArrowDown}');
      expect(await screen.findAllByRole('option')).toHaveLength(4);
    });
  });
});
