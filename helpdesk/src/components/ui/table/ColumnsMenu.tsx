import { Columns3 } from 'lucide-react';
import { IconButton } from '../IconButton';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../Menu';
import { columnLabel } from './columns';
import type { ColumnDef } from './types';
import { useTableColumns } from './useTableColumns';

export interface ColumnsMenuProps<T> {
  /** Mesmo `id` e mesmas definições passados à Table. */
  id: string;
  columns: ColumnDef<T>[];
  /** Nome acessível e Tooltip do botão. Padrão: "Colunas". */
  label?: string;
  align?: 'start' | 'end';
  className?: string;
}

/**
 * Menu com uma caixa de seleção por coluna `hideable`. Fica aberto ao marcar/desmarcar (várias trocas seguidas)
 * e fecha com Esc ou clique fora, devolvendo o foco ao botão. Sem colunas ocultáveis, não renderiza nada.
 */
export function ColumnsMenu<T>({ id, columns, label = 'Colunas', align = 'end', className }: ColumnsMenuProps<T>) {
  const { hideableColumns, isVisible, setVisible, reset } = useTableColumns(id, columns);
  if (hideableColumns.length === 0) return null;

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label={label} icon={<Columns3 />} variant="outline" className={className} />
      </MenuTrigger>
      <MenuContent align={align}>
        <MenuLabel>Colunas visíveis</MenuLabel>
        {hideableColumns.map((column) => {
          const visible = isVisible(column.id);
          return (
            <MenuItem
              key={column.id}
              checked={visible}
              textValue={columnLabel(column)}
              onSelect={(event) => {
                event.preventDefault();
                setVisible(column.id, !visible);
              }}
            >
              {columnLabel(column)}
            </MenuItem>
          );
        })}
        <MenuSeparator />
        <MenuItem
          onSelect={(event) => {
            event.preventDefault();
            reset();
          }}
        >
          Restaurar padrão
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
