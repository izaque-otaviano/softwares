import { ChevronDown } from 'lucide-react';
import { Button, Menu, MenuContent, MenuItems, MenuTrigger, type ButtonVariant, type MenuItemSpec } from '@/components/ui';

export interface DropdownButtonProps {
  label: string;
  items: MenuItemSpec[];
  variant?: ButtonVariant;
  disabled?: boolean;
}

/** Botão com seta (▾) que abre um menu: "Ações ▾", "Criar gatilho ▾". */
export function DropdownButton({ label, items, variant = 'outline', disabled }: DropdownButtonProps) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant={variant} disabled={disabled} trailingIcon={<ChevronDown />}>
          {label}
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItems items={items} />
      </MenuContent>
    </Menu>
  );
}
