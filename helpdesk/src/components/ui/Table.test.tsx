import { fireEvent, render, renderHook, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/store/useUi';
import { ColumnsMenu, Table, useTableColumns, type ColumnDef, type SortState, type TableProps } from './Table';

interface Ticket {
  id: string;
  subject: string;
  requester: string;
  status: 'Aberto' | 'Pendente' | 'Resolvido';
  priority: string;
}

const TICKETS: Ticket[] = [
  { id: '1', subject: 'Impressora não liga', requester: 'Ana Souza', status: 'Aberto', priority: 'Alta' },
  { id: '2', subject: 'Erro ao exportar', requester: 'Bruno Lima', status: 'Aberto', priority: 'Normal' },
  { id: '3', subject: 'Reembolso pendente', requester: 'Carla Dias', status: 'Pendente', priority: 'Baixa' },
  { id: '4', subject: 'Acesso negado', requester: 'Davi Alves', status: 'Resolvido', priority: 'Urgente' },
];

const COLUMNS: ColumnDef<Ticket>[] = [
  { id: 'subject', header: 'Assunto', cell: (r) => r.subject, sortable: true, width: 240 },
  { id: 'requester', header: 'Solicitante', cell: (r) => r.requester, sortable: true, width: 160, hideable: true },
  { id: 'priority', header: 'Prioridade', cell: (r) => r.priority, width: 120, hideable: true },
  { id: 'internal', header: 'Interno', cell: (r) => `int-${r.id}`, width: 80, defaultHidden: true },
];

function renderTable(props: Partial<TableProps<Ticket>> = {}) {
  return render(<Table<Ticket> id="t" aria-label="Tickets" columns={COLUMNS} rows={TICKETS} getRowId={(r) => r.id} {...props} />);
}

const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent);
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const focus = (element: HTMLElement) => act(() => element.focus());
const colWidths = () => Array.from(screen.getByRole('table').querySelectorAll('col')).map((c) => (c as HTMLElement).style.width);

beforeEach(() => {
  localStorage.clear();
  useUi.setState({ tableColumns: {} });
});

describe('Table: estrutura e dados', () => {
  it('é uma tabela semântica com nome, cabeçalhos de coluna e uma linha por item', () => {
    renderTable();
    const table = screen.getByRole('table', { name: 'Tickets' });
    expect(table).toHaveClass('table-fixed');
    expect(headers()).toEqual(['Assunto', 'Solicitante', 'Prioridade']);
    screen.getAllByRole('columnheader').forEach((h) => expect(h).toHaveAttribute('scope', 'col'));
    expect(bodyRows()).toHaveLength(4);
    expect(within(bodyRows()[0]).getByText('Impressora não liga')).toBeInTheDocument();
    expect(within(bodyRows()[3]).getByText('Urgente')).toBeInTheDocument();
  });

  it('não renderiza colunas defaultHidden', () => {
    renderTable();
    expect(screen.queryByText('Interno')).not.toBeInTheDocument();
    expect(screen.queryByText('int-1')).not.toBeInTheDocument();
  });

  it('o colgroup reserva a largura de cada coluna (layout fixo)', () => {
    renderTable();
    expect(colWidths()).toEqual(['240px', '160px', '120px', '']);
  });

  it('o contêiner é um grupo nomeado, focável só por script, e destino do foco quando uma linha some', () => {
    const { container } = renderTable();
    const region = screen.getByRole('group', { name: 'Tickets' });
    expect(region).toBe(container.firstElementChild);
    expect(region).toHaveAttribute('tabindex', '-1');
    expect(region).toHaveAttribute('data-focus-fallback');
  });

  it('mescla className no contêiner rolável', () => {
    const { container } = renderTable({ className: 'h-full' });
    expect(container.firstElementChild).toHaveClass('overflow-auto', 'h-full');
  });

  it('cabeçalho fixo é opcional', () => {
    const { unmount } = renderTable();
    screen.getAllByRole('columnheader').forEach((h) => expect(h).not.toHaveClass('sticky'));
    unmount();
    renderTable({ stickyHeader: true });
    screen.getAllByRole('columnheader').forEach((h) => expect(h).toHaveClass('sticky', 'top-0'));
  });
});

describe('Table: ordenação', () => {
  it('só marca aria-sort na coluna ordenada', () => {
    const { rerender } = renderTable({ sort: { columnId: 'subject', direction: 'asc' }, onSortChange: vi.fn() });
    expect(screen.getByRole('columnheader', { name: 'Assunto' })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'Solicitante' })).not.toHaveAttribute('aria-sort');
    rerender(
      <Table<Ticket>
        id="t"
        aria-label="Tickets"
        columns={COLUMNS}
        rows={TICKETS}
        getRowId={(r) => r.id}
        sort={{ columnId: 'subject', direction: 'desc' }}
        onSortChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Assunto' })).toHaveAttribute('aria-sort', 'descending');
  });

  it('cabeçalhos ordenáveis são botões; os demais, não', () => {
    renderTable({ onSortChange: vi.fn() });
    expect(screen.getByRole('button', { name: 'Assunto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitante' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prioridade' })).not.toBeInTheDocument();
  });

  it('sem onSortChange os cabeçalhos são só texto', () => {
    renderTable();
    expect(screen.queryByRole('button', { name: 'Assunto' })).not.toBeInTheDocument();
  });

  it('o clique repetido cicla asc -> desc -> null e trocar de coluna recomeça em asc', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    function Harness() {
      const [sort, setSort] = useState<SortState | null>(null);
      return (
        <Table<Ticket>
          id="t"
          aria-label="Tickets"
          columns={COLUMNS}
          rows={TICKETS}
          getRowId={(r) => r.id}
          sort={sort}
          onSortChange={(next) => {
            onSortChange(next);
            setSort(next);
          }}
        />
      );
    }
    render(<Harness />);
    const subject = () => screen.getByRole('button', { name: 'Assunto' });

    await user.click(subject());
    await user.click(subject());
    await user.click(subject());
    await user.click(screen.getByRole('button', { name: 'Solicitante' }));

    expect(onSortChange.mock.calls.map(([s]) => s)).toEqual([
      { columnId: 'subject', direction: 'asc' },
      { columnId: 'subject', direction: 'desc' },
      null,
      { columnId: 'requester', direction: 'asc' },
    ]);
    expect(screen.getByRole('columnheader', { name: 'Solicitante' })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'Assunto' })).not.toHaveAttribute('aria-sort');
  });

  it('não reordena as linhas sozinha', async () => {
    const user = userEvent.setup();
    renderTable({ sort: { columnId: 'subject', direction: 'asc' }, onSortChange: vi.fn() });
    await user.click(screen.getByRole('button', { name: 'Assunto' }));
    expect(within(bodyRows()[0]).getByText('Impressora não liga')).toBeInTheDocument();
    expect(within(bodyRows()[3]).getByText('Acesso negado')).toBeInTheDocument();
  });

  it('ordena pelo teclado (Enter no botão do cabeçalho)', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderTable({ onSortChange });
    focus(screen.getByRole('button', { name: 'Assunto' }));
    await user.keyboard('{Enter}');
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'subject', direction: 'asc' });
  });
});

describe('Table: seleção', () => {
  function SelectHarness({ onChange, initial = [] }: { onChange?: (ids: Set<string>) => void; initial?: string[] }) {
    const [selected, setSelected] = useState<Set<string>>(new Set(initial));
    return (
      <Table<Ticket>
        id="t"
        aria-label="Tickets"
        columns={COLUMNS}
        rows={TICKETS}
        getRowId={(r) => r.id}
        selectable
        selectedIds={selected}
        onSelectionChange={(ids) => {
          onChange?.(ids);
          setSelected(ids);
        }}
        getRowLabel={(r) => `Ticket #${r.id}`}
      />
    );
  }
  const selectAll = () => screen.getByRole('checkbox', { name: 'Selecionar todas as linhas' });

  it('mostra uma caixa por linha e a de selecionar tudo no cabeçalho', () => {
    render(<SelectHarness />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(selectAll()).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Ticket #1' })).not.toBeChecked();
  });

  it('o cabeçalho de seleção usa o mesmo padding das células de controle das linhas (caixas alinhadas)', () => {
    // Sem tailwind-merge, `px-3` + `px-2` no mesmo <th> deixavam a caixa do cabeçalho 4px fora de alinhamento.
    renderTable({ selectable: true, rowActions: () => [] });
    const headerCells = screen.getAllByRole('columnheader');
    const selectHeader = headerCells[0];
    const actionsHeader = headerCells[headerCells.length - 1];
    const firstRowCells = within(bodyRows()[0]).getAllByRole('cell');
    const paddings = (el: Element) => [...el.classList].filter((c) => /^px-\d/.test(c));
    expect(paddings(selectHeader)).toEqual(['px-2']);
    expect(paddings(firstRowCells[0])).toEqual(['px-2']);
    expect(paddings(actionsHeader)).toEqual(['px-2']);
    expect(paddings(firstRowCells[firstRowCells.length - 1])).toEqual(['px-2']);
    // As colunas de dados seguem em px-3, cabeçalho e corpo.
    expect(paddings(headerCells[1])).toEqual(['px-3']);
    expect(paddings(firstRowCells[1])).toEqual(['px-3']);
  });

  it('sem selectable não há caixas', () => {
    renderTable();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('seleção parcial deixa "selecionar tudo" indeterminado; clicar nele seleciona todas', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectHarness onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ticket #2' }));
    expect(onChange).toHaveBeenLastCalledWith(new Set(['2']));
    expect(selectAll()).toBePartiallyChecked();
    expect(bodyRows()[1]).toHaveAttribute('data-selected', 'true');
    expect(bodyRows()[0]).not.toHaveAttribute('data-selected');

    await user.click(selectAll());
    expect(onChange).toHaveBeenLastCalledWith(new Set(['1', '2', '3', '4']));
    expect(selectAll()).toBeChecked();
    expect(selectAll()).not.toBePartiallyChecked();
  });

  it('com tudo selecionado, clicar em "selecionar tudo" limpa a seleção', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectHarness onChange={onChange} initial={['1', '2', '3', '4']} />);
    expect(selectAll()).toBeChecked();
    await user.click(selectAll());
    expect(onChange).toHaveBeenLastCalledWith(new Set());
    expect(selectAll()).not.toBeChecked();
    expect(selectAll()).not.toBePartiallyChecked();
  });

  it('desmarcar a última linha volta ao estado sem seleção', async () => {
    const user = userEvent.setup();
    render(<SelectHarness initial={['3']} />);
    expect(selectAll()).toBePartiallyChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ticket #3' }));
    expect(selectAll()).not.toBePartiallyChecked();
    expect(selectAll()).not.toBeChecked();
  });

  it('a seleção por teclado (Espaço) funciona e não abre a linha', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onSelectionChange = vi.fn();
    renderTable({ selectable: true, selectedIds: new Set(), onSelectionChange, onRowClick, getRowLabel: (r) => `Ticket #${r.id}` });
    focus(screen.getByRole('checkbox', { name: 'Selecionar Ticket #1' }));
    await user.keyboard(' ');
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1']));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('sem linhas, "selecionar tudo" fica desabilitado', () => {
    renderTable({ selectable: true, rows: [], selectedIds: new Set() });
    expect(selectAll()).toBeDisabled();
  });
});

describe('Table: agrupamento', () => {
  const groupBy = (r: Ticket) => ({ key: r.status, label: r.status });
  const groupButtons = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));

  it('mostra um subtítulo por grupo, na ordem de aparição, com o contador', () => {
    renderTable({ groupBy });
    expect(groupButtons().map((b) => b.textContent)).toEqual(['Aberto (2)', 'Pendente (1)', 'Resolvido (1)']);
    groupButtons().forEach((b) => expect(b).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByText('Impressora não liga')).toBeInTheDocument();
  });

  it('o botão do grupo recolhe e expande as linhas (aria-expanded)', async () => {
    const user = userEvent.setup();
    renderTable({ groupBy });
    const open = screen.getByRole('button', { name: 'Aberto (2)' });

    await user.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Impressora não liga')).not.toBeInTheDocument();
    expect(screen.queryByText('Erro ao exportar')).not.toBeInTheDocument();
    expect(screen.getByText('Reembolso pendente')).toBeInTheDocument();

    await user.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Impressora não liga')).toBeInTheDocument();
  });

  it('recolhe pelo teclado (Enter no botão focado)', async () => {
    const user = userEvent.setup();
    renderTable({ groupBy });
    focus(screen.getByRole('button', { name: 'Pendente (1)' }));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Pendente (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Reembolso pendente')).not.toBeInTheDocument();
  });

  it('defaultCollapsedGroups começa com grupos recolhidos', () => {
    renderTable({ groupBy, defaultCollapsedGroups: ['Pendente', 'Resolvido'] });
    expect(screen.getByRole('button', { name: 'Pendente (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Aberto (2)' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('Acesso negado')).not.toBeInTheDocument();
    expect(screen.getByText('Erro ao exportar')).toBeInTheDocument();
  });

  it('aceita label em ReactNode', () => {
    renderTable({ groupBy: (r) => ({ key: r.status, label: <strong>Categoria: {r.status}</strong> }) });
    expect(screen.getByRole('button', { name: 'Categoria: Aberto (2)' })).toBeInTheDocument();
  });
});

describe('Table: ações da linha (kebab) e clique na linha', () => {
  const rowActions = (onEdit: (id: string) => void) => (row: Ticket) => [
    { id: 'edit', label: 'Editar', onSelect: () => onEdit(row.id) },
    { id: 'delete', label: 'Apagar', tone: 'danger' as const, onSelect: () => {} },
  ];

  it('mostra um kebab por linha, na coluna "Ações", com nome por linha quando há getRowLabel', () => {
    renderTable({ rowActions: rowActions(vi.fn()), getRowLabel: (r) => `Ticket #${r.id}` });
    expect(screen.getByRole('columnheader', { name: 'Ações' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Mais ações: Ticket #/ })).toHaveLength(4);
  });

  it('sem getRowLabel o kebab se chama "Mais ações"', () => {
    renderTable({ rowActions: rowActions(vi.fn()) });
    expect(screen.getAllByRole('button', { name: 'Mais ações' })).toHaveLength(4);
  });

  it('linha sem ações não mostra kebab', () => {
    renderTable({ rowActions: (r) => (r.id === '1' ? [] : [{ id: 'x', label: 'Abrir', onSelect: () => {} }]) });
    expect(screen.getAllByRole('button', { name: 'Mais ações' })).toHaveLength(3);
  });

  it('abrir o kebab e escolher um item não dispara onRowClick (mouse)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onRowClick = vi.fn();
    renderTable({ rowActions: rowActions(onEdit), onRowClick, getRowLabel: (r) => `Ticket #${r.id}` });

    await user.click(screen.getByRole('button', { name: 'Mais ações: Ticket #2' }));
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Editar', 'Apagar']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Editar' }));

    expect(onEdit).toHaveBeenCalledWith('2');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('abrir o kebab e escolher um item não dispara onRowClick (teclado)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onRowClick = vi.fn();
    renderTable({ rowActions: rowActions(onEdit), onRowClick, getRowLabel: (r) => `Ticket #${r.id}` });

    focus(screen.getByRole('button', { name: 'Mais ações: Ticket #3' }));
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Editar' })).toHaveFocus());
    await user.keyboard('{Enter}');

    expect(onEdit).toHaveBeenCalledWith('3');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('clicar na linha chama onRowClick com a linha; a linha é focável', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderTable({ onRowClick });
    bodyRows().forEach((r) => expect(r).toHaveAttribute('tabindex', '0'));
    await user.click(screen.getByText('Erro ao exportar'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(TICKETS[1]);
  });

  it('Enter com a linha focada abre; Tab chega à linha', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderTable({ onRowClick });
    await user.tab();
    expect(bodyRows()[0]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledWith(TICKETS[0]);
  });

  it('Enter em um controle dentro da linha não abre a linha', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderTable({ onRowClick, selectable: true, selectedIds: new Set(), onSelectionChange: vi.fn() });
    focus(screen.getAllByRole('checkbox', { name: 'Selecionar linha' })[0]);
    await user.keyboard('{Enter}');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('clicar na caixa de seleção, ou no espaço ao redor dela, não abre a linha', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderTable({ onRowClick, selectable: true, selectedIds: new Set(), onSelectionChange: vi.fn() });
    const box = screen.getAllByRole('checkbox', { name: 'Selecionar linha' })[0];
    await user.click(box);
    await user.click(box.closest('td') as HTMLElement);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('um link dentro de uma célula fica com o clique', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const columns: ColumnDef<Ticket>[] = [
      { id: 'subject', header: 'Assunto', cell: (r) => <a href={`#cliente-${r.id}`}>{r.requester}</a> },
      { id: 'priority', header: 'Prioridade', cell: (r) => r.priority },
    ];
    renderTable({ columns, onRowClick });
    await user.click(screen.getByRole('link', { name: 'Ana Souza' }));
    expect(onRowClick).not.toHaveBeenCalled();
    await user.click(screen.getByText('Alta'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('sem onRowClick as linhas não são focáveis', () => {
    renderTable();
    bodyRows().forEach((r) => expect(r).not.toHaveAttribute('tabindex'));
  });
});

describe('Table: colunas redimensionáveis', () => {
  const handle = (name = 'Assunto') => screen.getByRole('separator', { name: `Redimensionar coluna ${name}` });
  const storedWidths = () => useUi.getState().tableColumns.t?.widths;

  it('sem resizable não há alças', () => {
    renderTable();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('cada cabeçalho tem um separador vertical focável com valores ARIA', () => {
    renderTable({ resizable: true });
    expect(screen.getAllByRole('separator')).toHaveLength(3);
    const h = handle();
    expect(h).toHaveAttribute('aria-orientation', 'vertical');
    expect(h).toHaveAttribute('aria-valuenow', '240');
    expect(h).toHaveAttribute('aria-valuemin', '64');
    expect(h).toHaveAttribute('aria-valuemax', '800');
    expect(h).toHaveAttribute('tabindex', '0');
  });

  it('a área de ponteiro da alça tem 24px de largura (WCAG 2.5.8), com a linha visível de 1px no centro', () => {
    renderTable({ resizable: true });
    const h = handle();
    expect(h).toHaveClass('w-6', '-right-3');
    expect(h).not.toHaveClass('w-3');
    const line = h.firstElementChild as HTMLElement;
    expect(line).toHaveClass('w-px', 'bg-fg-subtle', 'left-1/2');
  });

  it('a alça de redimensionar não entra no nome acessível do cabeçalho da coluna', () => {
    renderTable({ resizable: true, onSortChange: vi.fn() });
    expect(screen.getByRole('columnheader', { name: 'Assunto' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Prioridade' })).toBeInTheDocument();
    // A alça continua com o próprio nome, dentro do mesmo <th>.
    expect(within(screen.getByRole('columnheader', { name: 'Assunto' })).getByRole('separator', { name: 'Redimensionar coluna Assunto' })).toBeInTheDocument();
  });

  it('setas ajustam 8 px e Shift 24 px, e o valor persiste no store', async () => {
    const user = userEvent.setup();
    renderTable({ resizable: true });
    focus(handle());

    await user.keyboard('{ArrowRight}');
    expect(handle()).toHaveAttribute('aria-valuenow', '248');
    expect(colWidths()[0]).toBe('248px');
    expect(storedWidths()).toEqual({ subject: 248 });

    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(handle()).toHaveAttribute('aria-valuenow', '272');

    await user.keyboard('{ArrowLeft}');
    expect(handle()).toHaveAttribute('aria-valuenow', '264');
    expect(storedWidths()).toEqual({ subject: 264 });
    expect(handle()).toHaveFocus();
  });

  it('respeita a largura mínima', async () => {
    const user = userEvent.setup();
    const columns: ColumnDef<Ticket>[] = [
      { id: 'subject', header: 'Assunto', cell: (r) => r.subject, width: 80 },
      { id: 'priority', header: 'Prioridade', cell: (r) => r.priority, width: 80, minWidth: 72 },
    ];
    renderTable({ columns, resizable: true });
    focus(handle());
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(handle()).toHaveAttribute('aria-valuenow', '64');
    await user.keyboard('{ArrowLeft}');
    expect(handle()).toHaveAttribute('aria-valuenow', '64');
    expect(storedWidths()).toEqual({ subject: 64 });

    focus(handle('Prioridade'));
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(handle('Prioridade')).toHaveAttribute('aria-valuenow', '72');
  });

  it('a largura salva volta ao montar de novo e vale sem resizable', async () => {
    const user = userEvent.setup();
    const first = renderTable({ resizable: true });
    focus(handle());
    await user.keyboard('{ArrowRight}{ArrowRight}');
    first.unmount();

    renderTable();
    expect(colWidths()[0]).toBe('256px');
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('larguras de tabelas com ids diferentes não se misturam', async () => {
    const user = userEvent.setup();
    renderTable({ resizable: true, id: 'a' });
    focus(handle());
    await user.keyboard('{ArrowRight}');
    expect(useUi.getState().tableColumns.a?.widths).toEqual({ subject: 248 });
    expect(useUi.getState().tableColumns.t).toBeUndefined();
  });

  it('arrastar com o ponteiro mostra a largura ao vivo e só persiste ao soltar', () => {
    renderTable({ resizable: true });
    const h = handle();

    fireEvent.pointerDown(h, { pointerId: 1, button: 0, clientX: 300 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 340 });
    expect(h).toHaveAttribute('aria-valuenow', '280');
    expect(colWidths()[0]).toBe('280px');
    expect(storedWidths()).toBeUndefined();

    fireEvent.pointerMove(h, { pointerId: 1, clientX: 350 });
    fireEvent.pointerUp(h, { pointerId: 1, clientX: 350 });
    expect(h).toHaveAttribute('aria-valuenow', '290');
    expect(storedWidths()).toEqual({ subject: 290 });

    // Depois de soltar, mover o mouse não arrasta mais.
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 500 });
    expect(h).toHaveAttribute('aria-valuenow', '290');
  });

  it('arrastar não passa do mínimo', () => {
    renderTable({ resizable: true });
    const h = handle();
    fireEvent.pointerDown(h, { pointerId: 1, button: 0, clientX: 300 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 0 });
    expect(h).toHaveAttribute('aria-valuenow', '64');
    fireEvent.pointerUp(h, { pointerId: 1, clientX: 0 });
    expect(storedWidths()).toEqual({ subject: 64 });
  });

  it('cancelar o arrasto descarta a largura provisória', () => {
    renderTable({ resizable: true });
    const h = handle();
    fireEvent.pointerDown(h, { pointerId: 1, button: 0, clientX: 300 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 360 });
    expect(h).toHaveAttribute('aria-valuenow', '300');
    fireEvent.pointerCancel(h, { pointerId: 1 });
    expect(h).toHaveAttribute('aria-valuenow', '240');
    expect(storedWidths()).toBeUndefined();
  });

  it('soltar sem mover não grava nada; botão direito não inicia arrasto', () => {
    renderTable({ resizable: true });
    const h = handle();
    fireEvent.pointerDown(h, { pointerId: 1, button: 0, clientX: 300 });
    fireEvent.pointerUp(h, { pointerId: 1, clientX: 300 });
    expect(storedWidths()).toBeUndefined();

    fireEvent.pointerDown(h, { pointerId: 1, button: 2, clientX: 300 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 340 });
    expect(h).toHaveAttribute('aria-valuenow', '240');
  });
});

describe('Table: colunas visíveis e ColumnsMenu', () => {
  it('usa a visibilidade e a ordem salvas no store', () => {
    useUi.getState().setTableColumns('t', { visible: ['priority', 'internal', 'subject'] });
    renderTable();
    expect(headers()).toEqual(['Prioridade', 'Interno', 'Assunto']);
    expect(within(bodyRows()[0]).getByText('int-1')).toBeInTheDocument();
  });

  it('o menu lista as colunas ocultáveis marcadas conforme a visibilidade', async () => {
    const user = userEvent.setup();
    render(<ColumnsMenu id="t" columns={COLUMNS} />);
    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitemcheckbox');
    expect(items.map((i) => [i.textContent, i.getAttribute('aria-checked')])).toEqual([
      ['Solicitante', 'true'],
      ['Prioridade', 'true'],
      ['Interno', 'false'],
    ]);
    expect(within(menu).queryByRole('menuitemcheckbox', { name: 'Assunto' })).not.toBeInTheDocument();
  });

  it('marcar e desmarcar no menu atualiza a tabela, persiste e mantém o menu aberto', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ColumnsMenu id="t" columns={COLUMNS} />
        <Table<Ticket> id="t" aria-label="Tickets" columns={COLUMNS} rows={TICKETS} getRowId={(r) => r.id} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    const menu = await screen.findByRole('menu');

    await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'Prioridade' }));
    expect(headers()).toEqual(['Assunto', 'Solicitante']);
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Prioridade' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(useUi.getState().tableColumns.t?.visible).toEqual(['subject', 'requester']);

    await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'Interno' }));
    expect(headers()).toEqual(['Assunto', 'Solicitante', 'Interno']);

    await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'Prioridade' }));
    expect(headers()).toEqual(['Assunto', 'Solicitante', 'Prioridade', 'Interno']);
  });

  it('"Restaurar padrão" volta colunas e larguras ao original', async () => {
    const user = userEvent.setup();
    useUi.getState().setTableColumns('t', { visible: ['subject'], widths: { subject: 500 } });
    render(
      <>
        <ColumnsMenu id="t" columns={COLUMNS} />
        <Table<Ticket> id="t" aria-label="Tickets" columns={COLUMNS} rows={TICKETS} getRowId={(r) => r.id} />
      </>,
    );
    expect(headers()).toEqual(['Assunto']);
    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurar padrão' }));
    expect(headers()).toEqual(['Assunto', 'Solicitante', 'Prioridade']);
    expect(colWidths()[0]).toBe('240px');
    expect(useUi.getState().tableColumns.t?.visible).toBeUndefined();
    expect(useUi.getState().tableColumns.t?.widths).toBeUndefined();
  });

  it('Esc fecha o menu e devolve o foco ao botão', async () => {
    const user = userEvent.setup();
    render(<ColumnsMenu id="t" columns={COLUMNS} label="Gerenciar colunas" />);
    const trigger = screen.getByRole('button', { name: 'Gerenciar colunas' });
    await user.click(trigger);
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('sem colunas ocultáveis não renderiza nada', () => {
    const { container } = render(<ColumnsMenu id="t" columns={[{ id: 'a', header: 'A', cell: () => null }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('useTableColumns', () => {
  it('expõe colunas visíveis, larguras e controles; ignora colunas fixas', () => {
    const { result } = renderHook(() => useTableColumns('t', COLUMNS));
    expect(result.current.columns.map((c) => c.id)).toEqual(['subject', 'requester', 'priority']);
    expect(result.current.hideableColumns.map((c) => c.id)).toEqual(['requester', 'priority', 'internal']);
    expect(result.current.widths).toEqual({ subject: 240, requester: 160, priority: 120 });

    act(() => result.current.setVisible('subject', false));
    expect(result.current.isVisible('subject')).toBe(true);
    expect(useUi.getState().tableColumns.t).toBeUndefined();
  });

  it('setVisibleColumns define ordem e visibilidade', () => {
    const { result } = renderHook(() => useTableColumns('t', COLUMNS));
    act(() => result.current.setVisibleColumns(['internal', 'priority']));
    expect(result.current.columns.map((c) => c.id)).toEqual(['subject', 'internal', 'priority']);
  });

  it('setWidth respeita o mínimo, preserva as outras larguras e ignora colunas desconhecidas', () => {
    const { result } = renderHook(() => useTableColumns('t', COLUMNS));
    act(() => result.current.setWidth('subject', 300));
    act(() => result.current.setWidth('requester', 10));
    act(() => result.current.setWidth('nao-existe', 300));
    expect(result.current.widths).toMatchObject({ subject: 300, requester: 64 });
    expect(useUi.getState().tableColumns.t?.widths).toEqual({ subject: 300, requester: 64 });
  });

  it('reset limpa visibilidade e larguras', () => {
    const { result } = renderHook(() => useTableColumns('t', COLUMNS));
    act(() => result.current.setWidth('subject', 300));
    act(() => result.current.setVisible('priority', false));
    act(() => result.current.reset());
    expect(result.current.columns.map((c) => c.id)).toEqual(['subject', 'requester', 'priority']);
    expect(result.current.widths.subject).toBe(240);
  });
});

describe('Table: estados', () => {
  it('carregando: esqueleto com uma célula por coluna visível, cabeçalho preservado e aria-busy', () => {
    const { container } = renderTable({ loading: true, rows: [] });
    expect(screen.getByRole('status')).toHaveTextContent('Carregando...');
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(headers()).toEqual(['Assunto', 'Solicitante', 'Prioridade']);
    const skeletonRows = container.querySelectorAll('[data-skeleton-row]');
    expect(skeletonRows.length).toBeGreaterThan(0);
    // Um bloco por coluna visível, cada um dentro da sua própria <td> (alinhada ao cabeçalho e ao colgroup).
    expect(skeletonRows[0].querySelectorAll('[data-skeleton]')).toHaveLength(3);
    expect(screen.queryByText('Impressora não liga')).not.toBeInTheDocument();
  });

  it('carregando: as linhas do esqueleto têm as mesmas células (e colspan 1) das linhas de dados, com seleção e ações', () => {
    const props = { selectable: true, rowActions: () => [] } as const;
    const { container, rerender } = renderTable({ loading: true, rows: [], ...props });
    const skeleton = container.querySelector('[data-skeleton-row]')!;
    const skeletonCells = Array.from(skeleton.children);
    expect(skeletonCells.every((cell) => !cell.hasAttribute('colspan'))).toBe(true);
    expect(skeleton.querySelectorAll('[data-skeleton]')).toHaveLength(4); // caixa + 3 colunas
    rerender(
      <Table<Ticket> id="t" aria-label="Tickets" columns={COLUMNS} rows={TICKETS} getRowId={(r) => r.id} {...props} />,
    );
    expect(bodyRows()[0].children).toHaveLength(skeletonCells.length);
  });

  it('carregando sobrepõe dados, erro e vazio', () => {
    renderTable({ loading: true, error: 'Falha', rows: [] });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('trocar de carregando para dados mantém colgroup e cabeçalhos (sem layout shift)', () => {
    const { rerender } = renderTable({ loading: true, rows: [], selectable: true, rowActions: () => [] });
    const before = { cols: colWidths(), headers: screen.getAllByRole('columnheader').length };
    rerender(
      <Table<Ticket>
        id="t"
        aria-label="Tickets"
        columns={COLUMNS}
        rows={TICKETS}
        getRowId={(r) => r.id}
        selectable
        rowActions={() => []}
      />,
    );
    expect(colWidths()).toEqual(before.cols);
    expect(screen.getAllByRole('columnheader')).toHaveLength(before.headers);
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy');
    expect(bodyRows()).toHaveLength(4);
  });

  it('vazio: EmptyState com título, descrição e ação, e o cabeçalho continua', () => {
    renderTable({
      rows: [],
      empty: { illustration: 'search', title: 'Nenhum ticket nesta visualização', description: 'Tente outro filtro.', action: <button type="button">Limpar filtros</button> },
    });
    expect(screen.getByText('Nenhum ticket nesta visualização')).toBeInTheDocument();
    expect(screen.getByText('Tente outro filtro.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();
    expect(headers()).toEqual(['Assunto', 'Solicitante', 'Prioridade']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('vazio sem configuração usa um texto padrão', () => {
    renderTable({ rows: [] });
    expect(screen.getByText('Nenhum item encontrado')).toBeInTheDocument();
  });

  it('o estado vazio ocupa todas as colunas', () => {
    renderTable({ rows: [], selectable: true, rowActions: () => [] });
    // selecionar + 3 colunas + preenchimento + ações
    expect(screen.getByText('Nenhum item encontrado').closest('td')).toHaveAttribute('colspan', '6');
  });

  it('erro em texto: Banner com role=alert, sem botão de nova tentativa, cabeçalho preservado', () => {
    renderTable({ error: 'Não foi possível carregar os tickets.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os tickets.');
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
    expect(headers()).toEqual(['Assunto', 'Solicitante', 'Prioridade']);
    expect(screen.queryByText('Impressora não liga')).not.toBeInTheDocument();
  });

  it('erro com { message, onRetry }: "Tentar novamente" chama onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderTable({ error: { message: 'Falha de rede.', onRetry } });
    expect(screen.getByRole('alert')).toHaveTextContent('Falha de rede.');
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('erro em ReactNode também é aceito', () => {
    renderTable({ error: <span>Erro <strong>grave</strong></span> });
    expect(screen.getByRole('alert')).toHaveTextContent('Erro grave');
  });

  it('sem error (undefined/null/false) mostra os dados', () => {
    const { rerender } = renderTable({ error: null });
    expect(bodyRows()).toHaveLength(4);
    rerender(<Table<Ticket> id="t" aria-label="Tickets" columns={COLUMNS} rows={TICKETS} getRowId={(r) => r.id} error={false} />);
    expect(bodyRows()).toHaveLength(4);
  });
});
