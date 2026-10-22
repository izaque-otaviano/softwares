import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from './Combobox';
import type { ComboOption } from './Combobox';

const PEOPLE: ComboOption[] = [
  { value: 'u1', label: 'Maria Souza', description: 'maria@exemplo.com.br' },
  { value: 'u2', label: 'João Pereira', description: 'joao@exemplo.com.br' },
  { value: 'u3', label: 'Ana Lima', description: 'ana@outra.com' },
  { value: 'u4', label: 'Carlos Dias', description: 'carlos@exemplo.com.br', disabled: true },
];

function StaticHarness({
  initial = null,
  onChange,
  clearable,
}: {
  initial?: string | null;
  onChange?: (v: string | null) => void;
  clearable?: boolean;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <Combobox
      aria-label="Solicitante"
      placeholder="Selecione"
      searchPlaceholder="Buscar pessoa"
      options={PEOPLE}
      value={value}
      clearable={clearable}
      onValueChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const trigger = () => screen.getByRole('combobox', { name: 'Solicitante' });

describe('Combobox (estático)', () => {
  it('gatilho: role=combobox, aria-expanded e aria-controls apontando para o listbox', async () => {
    const user = userEvent.setup();
    render(<StaticHarness />);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveTextContent('Selecione');

    await user.click(trigger());
    const listbox = await screen.findByRole('listbox');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-controls', listbox.id));
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('o campo de busca recebe o foco ao abrir e filtra sem diferenciar acentos, por rótulo e descrição', async () => {
    const user = userEvent.setup();
    render(<StaticHarness />);
    await user.click(trigger());
    const search = await screen.findByPlaceholderText('Buscar pessoa');
    expect(search).toHaveFocus();

    await user.type(search, 'joao');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /João Pereira/ })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'outra.com');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Ana Lima/ })).toBeInTheDocument();
  });

  it('mostra o texto de vazio quando nada casa', async () => {
    const user = userEvent.setup();
    render(<StaticHarness />);
    await user.click(trigger());
    await user.type(await screen.findByPlaceholderText('Buscar pessoa'), 'zzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Nenhum resultado encontrado.')).toBeInTheDocument();
  });

  it('escolhe com setas + Enter, fecha e devolve o foco ao gatilho', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StaticHarness onChange={onChange} />);
    trigger().focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('u2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('João Pereira');
    expect(trigger()).toHaveFocus();
  });

  it('ArrowDown no gatilho abre a lista', async () => {
    const user = userEvent.setup();
    render(<StaticHarness />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('Esc fecha sem alterar o valor e devolve o foco ao gatilho', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StaticHarness onChange={onChange} />);
    await user.click(trigger());
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger()).toHaveFocus();
  });

  it('clique fora fecha', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Outro</button>
        <StaticHarness />
      </div>,
    );
    await user.click(trigger());
    await screen.findByRole('listbox');
    await user.click(screen.getByRole('button', { name: 'Outro' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('clique fora no "nada" devolve o foco ao gatilho; clique em outro controle deixa o foco com ele', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <p>Fora</p>
        <button type="button">Outro</button>
        <StaticHarness />
      </div>,
    );
    await user.click(trigger());
    await screen.findByRole('listbox');
    await user.click(screen.getByText('Fora'));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger()).toHaveFocus());

    await user.click(trigger());
    await screen.findByRole('listbox');
    await user.click(screen.getByRole('button', { name: 'Outro' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('button', { name: 'Outro' })).toHaveFocus();
  });

  it('indica a opção selecionada e a destaca ao reabrir', async () => {
    const user = userEvent.setup();
    render(<StaticHarness initial="u3" />);
    expect(trigger()).toHaveTextContent('Ana Lima');
    await user.click(trigger());
    const selected = await screen.findByRole('option', { name: /Ana Lima/ });
    expect(selected).toHaveTextContent('(selecionado)');
    await waitFor(() => expect(selected).toHaveAttribute('aria-selected', 'true'));
  });

  it('item desabilitado não pode ser escolhido', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StaticHarness onChange={onChange} />);
    await user.click(trigger());
    const disabled = await screen.findByRole('option', { name: /Carlos Dias/ });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await user.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clearable: botão "Limpar seleção" zera o valor e foca o gatilho; some sem valor', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StaticHarness initial="u1" clearable onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(trigger()).toHaveTextContent('Selecione');
    expect(trigger()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Limpar seleção' })).not.toBeInTheDocument();
  });

  it('renderOption substitui o conteúdo do item', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        aria-label="Solicitante"
        value={null}
        onValueChange={() => undefined}
        options={PEOPLE}
        renderOption={(o) => <b data-testid="custom">{o.label.toUpperCase()}</b>}
      />,
    );
    await user.click(trigger());
    expect(await screen.findAllByTestId('custom')).toHaveLength(4);
  });

  it('invalid marca aria-invalid; disabled desabilita o gatilho', () => {
    const { rerender } = render(
      <Combobox aria-label="Solicitante" value={null} onValueChange={() => undefined} options={PEOPLE} invalid />,
    );
    expect(trigger()).toHaveAttribute('aria-invalid', 'true');
    rerender(<Combobox aria-label="Solicitante" value={null} onValueChange={() => undefined} options={PEOPLE} disabled />);
    expect(trigger()).toBeDisabled();
  });
});

describe('Combobox (assíncrono)', () => {
  function AsyncHarness({
    loadOptions,
    onChange,
  }: {
    loadOptions: (q: string) => Promise<ComboOption[]>;
    onChange?: (v: string | null) => void;
  }) {
    const [value, setValue] = useState<string | null>(null);
    return (
      <Combobox
        aria-label="Solicitante"
        placeholder="Selecione"
        searchPlaceholder="Buscar pessoa"
        loadOptions={loadOptions}
        value={value}
        onValueChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  it('mostra o skeleton enquanto carrega e depois as opções', async () => {
    const user = userEvent.setup();
    let resolve: (o: ComboOption[]) => void = () => undefined;
    const loadOptions = vi.fn(
      () =>
        new Promise<ComboOption[]>((res) => {
          resolve = res;
        }),
    );
    render(<AsyncHarness loadOptions={loadOptions} />);
    await user.click(trigger());

    const status = await screen.findByText('Carregando...');
    expect(status.closest('[role="status"]')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    await act(async () => resolve(PEOPLE));
    expect(await screen.findAllByRole('option')).toHaveLength(4);
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    expect(loadOptions).toHaveBeenCalledWith('');
  });

  it('busca com debounce de ~200 ms e só a última consulta vale', async () => {
    const user = userEvent.setup();
    const loadOptions = vi.fn(async (q: string) =>
      PEOPLE.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())),
    );
    render(<AsyncHarness loadOptions={loadOptions} />);
    await user.click(trigger());
    await screen.findAllByRole('option');
    loadOptions.mockClear();

    await user.type(screen.getByPlaceholderText('Buscar pessoa'), 'ana');
    // Digitou 3 letras seguidas: uma única consulta, com o texto completo.
    await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(1));
    expect(loadOptions).toHaveBeenCalledWith('ana');
    expect(await screen.findByRole('option', { name: /Ana Lima/ })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('escolhe uma opção carregada e mantém o rótulo no gatilho', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AsyncHarness loadOptions={async () => PEOPLE} onChange={onChange} />);
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: /Maria Souza/ }));
    expect(onChange).toHaveBeenCalledWith('u1');
    expect(trigger()).toHaveTextContent('Maria Souza');
  });

  it('erro: mostra alerta com "Tentar novamente" e recarrega ao clicar', async () => {
    const user = userEvent.setup();
    const loadOptions = vi
      .fn<(q: string) => Promise<ComboOption[]>>()
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValue(PEOPLE);
    render(<AsyncHarness loadOptions={loadOptions} />);
    await user.click(trigger());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar as opções.');
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findAllByRole('option')).toHaveLength(4);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(loadOptions).toHaveBeenCalledTimes(2);
  });

  it('lista vazia no modo assíncrono mostra o texto de vazio', async () => {
    const user = userEvent.setup();
    render(<AsyncHarness loadOptions={async () => []} />);
    await user.click(trigger());
    expect(await screen.findByText('Nenhum resultado encontrado.')).toBeInTheDocument();
  });
});
