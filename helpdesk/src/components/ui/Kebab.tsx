import { MoreVertical } from 'lucide-react';
import { forwardRef, type KeyboardEvent, type MouseEvent } from 'react';
import { IconButton } from './IconButton';
import { Menu, MenuContent, MenuItems, MenuTrigger, type MenuItemSpec } from './Menu';

export interface KebabProps {
  items: MenuItemSpec[];
  /** Nome acessível e Tooltip do botão. */
  label?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

// O Kebab vive dentro de linhas e cartões clicáveis: nada do que acontece nele (clique, Enter, Espaço,
// inclusive no menu em Portal, que borbulha pela árvore do React) deve acionar o contêiner.
const stopClick = (event: MouseEvent) => event.stopPropagation();
const stopKey = (event: KeyboardEvent) => event.stopPropagation();
const stopActivationKey = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
};

/** Botão ⋮ que abre um menu. Itens `danger` ficam sempre ao final, depois de um divisor. */
export const Kebab = forwardRef<HTMLButtonElement, KebabProps>(function Kebab(
  { items, label = 'Mais ações', align = 'end', disabled, size = 'md', className },
  ref,
) {
  // Sem ações não há o que abrir. `disabled` vai também ao gatilho do Radix: alguns navegadores
  // disparam pointerdown em botões desabilitados e o menu abriria mesmo assim.
  const isDisabled = disabled || items.length === 0;
  return (
    <Menu>
      <MenuTrigger asChild disabled={isDisabled}>
        <IconButton
          ref={ref}
          label={label}
          icon={<MoreVertical />}
          size={size}
          disabled={isDisabled}
          className={className}
          onClick={stopClick}
          onKeyDown={stopActivationKey}
        />
      </MenuTrigger>
      <MenuContent align={align} onClick={stopClick} onKeyDown={stopKey}>
        <MenuItems items={items} />
      </MenuContent>
    </Menu>
  );
});
