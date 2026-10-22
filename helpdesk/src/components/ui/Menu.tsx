import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { Fragment, forwardRef, type ComponentProps, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { isFocusAdrift, triggerOfRadixContent } from './focusUtils';
import { OPTION_ACTIVE_RADIX } from './optionStyles';

/** Descrição declarativa de um item de menu (usada por Kebab, Table.rowActions etc.). */
export type MenuItemSpec = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  separatorBefore?: boolean;
  /** Quando definido, o item vira uma opção marcável (role=menuitemcheckbox) com ✓ à direita. */
  checked?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Raiz e gatilho                                                              */
/* -------------------------------------------------------------------------- */

export type MenuProps = ComponentProps<typeof DropdownMenu.Root>;

/**
 * Raiz do menu. Não modal por padrão: o foco volta ao gatilho ao fechar, mas a página não
 * recebe `pointer-events: none` (evita o travamento clássico ao abrir um Modal a partir de um item).
 */
export function Menu({ modal = false, ...props }: MenuProps) {
  return <DropdownMenu.Root modal={modal} {...props} />;
}

export const MenuTrigger = DropdownMenu.Trigger;

/* -------------------------------------------------------------------------- */
/* Primitivos estilizados                                                      */
/* -------------------------------------------------------------------------- */

export type MenuContentProps = ComponentPropsWithoutRef<typeof DropdownMenu.Content>;

/**
 * Painel do menu (já dentro de um Portal). Fecha com Esc/clique fora e devolve o foco ao gatilho.
 * O Radix (menu não modal) NÃO devolve o foco ao gatilho quando o fechamento foi por clique fora: se o clique caiu no
 * "nada" (foco solto no `<body>` ou num contêiner), devolvemos nós; se caiu em outro controle, o foco fica com ele.
 */
export const MenuContent = forwardRef<ElementRef<typeof DropdownMenu.Content>, MenuContentProps>(function MenuContent(
  { className, sideOffset = 4, collisionPadding = 8, align = 'start', onCloseAutoFocus, ...rest },
  ref,
) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        align={align}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented && isFocusAdrift()) triggerOfRadixContent(event.target)?.focus();
        }}
        className={cn(
          'z-[80] max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-44 max-w-80 overflow-y-auto',
          'rounded border border-line bg-surface p-1 text-sm text-fg shadow-menu',
          'data-[state=open]:anim-pop-in data-[state=closed]:anim-fade-out',
          className,
        )}
        {...rest}
      />
    </DropdownMenu.Portal>
  );
});

export type MenuItemProps = Omit<ComponentPropsWithoutRef<typeof DropdownMenu.Item>, 'children'> & {
  children: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  tone?: 'default' | 'danger';
  /** Quando definido, vira opção marcável (role=menuitemcheckbox) e mostra ✓ à direita se verdadeiro. */
  checked?: boolean;
};

const ITEM_CLASS = [
  'flex min-h-8 w-full cursor-default select-none items-center gap-2 rounded-xs px-2 py-1 text-sm',
  'outline-none transition-colors duration-100',
  OPTION_ACTIVE_RADIX,
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
].join(' ');

/** Item h-8 (32px). Destaque por hover/teclado: bg-hover + barra action de 3px à esquerda (ver optionStyles); `tone="danger"` pinta o texto de text-danger. */
export const MenuItem = forwardRef<ElementRef<typeof DropdownMenu.Item>, MenuItemProps>(function MenuItem(
  { icon, shortcut, tone = 'default', checked, className, children, ...rest },
  ref,
) {
  const classes = cn(ITEM_CLASS, tone === 'danger' ? 'text-danger' : 'text-fg', className);
  const body = (
    <>
      {icon ? (
        <span
          aria-hidden
          className={cn('inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4', tone === 'danger' ? 'text-danger' : 'text-fg-muted')}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">{children}</span>
      {shortcut ? <span className="ml-4 shrink-0 text-xs text-fg-muted">{shortcut}</span> : null}
      {checked !== undefined ? (
        <span aria-hidden className="ml-2 inline-flex h-4 w-4 shrink-0 items-center justify-center">
          <DropdownMenu.ItemIndicator>
            <Check className="h-4 w-4" />
          </DropdownMenu.ItemIndicator>
        </span>
      ) : null}
    </>
  );

  if (checked !== undefined) {
    return (
      <DropdownMenu.CheckboxItem ref={ref} checked={checked} className={classes} {...rest}>
        {body}
      </DropdownMenu.CheckboxItem>
    );
  }
  return (
    <DropdownMenu.Item ref={ref} className={classes} {...rest}>
      {body}
    </DropdownMenu.Item>
  );
});

export type MenuSeparatorProps = ComponentPropsWithoutRef<typeof DropdownMenu.Separator>;

export const MenuSeparator = forwardRef<ElementRef<typeof DropdownMenu.Separator>, MenuSeparatorProps>(function MenuSeparator(
  { className, ...rest },
  ref,
) {
  return <DropdownMenu.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-line', className)} {...rest} />;
});

export type MenuLabelProps = ComponentPropsWithoutRef<typeof DropdownMenu.Label>;

/** Rótulo de grupo (12/600, text-fg-muted). Não é focável. */
export const MenuLabel = forwardRef<ElementRef<typeof DropdownMenu.Label>, MenuLabelProps>(function MenuLabel(
  { className, ...rest },
  ref,
) {
  return <DropdownMenu.Label ref={ref} className={cn('px-2 py-1.5 text-xs font-semibold text-fg-muted', className)} {...rest} />;
});

/* -------------------------------------------------------------------------- */
/* Renderização a partir de MenuItemSpec[]                                     */
/* -------------------------------------------------------------------------- */

export type NormalizedMenuItem = { item: MenuItemSpec; separator: boolean };

/**
 * Regras do menu aplicadas a uma lista de specs:
 * - itens `danger` vão SEMPRE para o final (ordem estável) e o primeiro deles recebe divisor antes;
 * - `separatorBefore` vira divisor, exceto no primeiro item (nunca começa com divisor).
 */
export function normalizeMenuItems(items: readonly MenuItemSpec[]): NormalizedMenuItem[] {
  const regular = items.filter((i) => i.tone !== 'danger');
  const danger = items.filter((i) => i.tone === 'danger');
  return [...regular, ...danger].map((item, index) => ({
    item,
    separator: index > 0 && (item.separatorBefore === true || (item.tone === 'danger' && index === regular.length)),
  }));
}

export type MenuItemsProps = { items: readonly MenuItemSpec[] };

/** Renderiza `MenuItemSpec[]` com divisores e ordem de ações destrutivas garantidas. */
export function MenuItems({ items }: MenuItemsProps) {
  return (
    <>
      {normalizeMenuItems(items).map(({ item, separator }) => (
        <Fragment key={item.id}>
          {separator ? <MenuSeparator /> : null}
          <MenuItem
            icon={item.icon}
            shortcut={item.shortcut}
            tone={item.tone}
            checked={item.checked}
            disabled={item.disabled}
            textValue={typeof item.label === 'string' ? item.label : undefined}
            onSelect={() => item.onSelect()}
          >
            {item.label}
          </MenuItem>
        </Fragment>
      ))}
    </>
  );
}
