import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { Button, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui';

export interface ViewActionsProps {
  grouped: boolean;
  onGroupedChange: (g: boolean) => void;
  onExport: () => void;
  onEdit: () => void;
  onClone: () => void;
  onResetColumns: () => void;
  onPlay: () => void;
  /** ▶ Play some quando a visualização está vazia. */
  canPlay: boolean;
  /** Só visões pessoais: apagar no servidor. */
  onDelete?: () => void;
}

const SUB_ITEM =
  'flex min-h-8 w-full cursor-default select-none items-center gap-2 rounded-xs px-2 py-1 text-sm text-fg outline-none transition-colors duration-100 data-[highlighted]:bg-hover';

/** Ações ▾ e ▶ Play do cabeçalho de uma visualização. */
export function ViewActions(p: ViewActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Menu>
        <MenuTrigger asChild>
          <Button variant="outline" trailingIcon={<ChevronDown />}>
            Ações
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={p.onExport}>Exportar como CSV</MenuItem>
          <MenuItem onSelect={p.onEdit}>Editar visualização</MenuItem>
          <MenuItem onSelect={p.onClone}>Clonar visualização</MenuItem>
          {p.onDelete ? (
            <MenuItem tone="danger" onSelect={p.onDelete}>
              Apagar visualização
            </MenuItem>
          ) : null}
          <MenuSeparator />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={SUB_ITEM}>
              <span className="min-w-0 flex-1">Visualização de tickets</span>
              <ChevronRight className="h-4 w-4 text-fg-muted" aria-hidden />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={4}
                collisionPadding={8}
                className="z-[80] min-w-52 rounded border border-line bg-surface p-1 text-sm text-fg shadow-menu data-[state=open]:anim-pop-in"
              >
                <DropdownMenu.CheckboxItem checked={p.grouped} onCheckedChange={p.onGroupedChange} className={SUB_ITEM}>
                  <span className="min-w-0 flex-1">Agrupar por categoria do status</span>
                  <DropdownMenu.ItemIndicator>
                    <Check className="h-4 w-4" aria-hidden />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.CheckboxItem>
                <DropdownMenu.Item className={SUB_ITEM} onSelect={p.onResetColumns}>
                  Restaurar colunas padrão
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </MenuContent>
      </Menu>
      {p.canPlay ? (
        <Button variant="ink" leadingIcon={<Play />} onClick={p.onPlay}>
          Play
        </Button>
      ) : null}
    </div>
  );
}
