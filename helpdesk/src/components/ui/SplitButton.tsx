import { ChevronDown, ChevronUp } from 'lucide-react';
import { Fragment, forwardRef, useId, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BUTTON_BASE, ButtonContent, buttonSurface } from './Button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './Menu';

export type SplitItem = {
  id: string;
  label: ReactNode;
  /** Elemento à esquerda do rótulo, ex.: um StatusDot. */
  leading?: ReactNode;
  description?: string;
  disabled?: boolean;
  separatorBefore?: boolean;
};

export interface SplitButtonProps {
  label: ReactNode;
  onClick: () => void;
  items: SplitItem[];
  onSelectItem: (item: SplitItem) => void;
  /** ink = envio do ticket (padrão); primary = ação de formulário. */
  variant?: 'ink' | 'primary';
  /** Mesma escala do Button: md = 32px (padrão), lg = 40px (o "Enviar como {Status}" da BottomBar). */
  size?: 'md' | 'lg';
  disabled?: boolean;
  /** Spinner no botão principal; bloqueia clique e abertura do menu, mantendo o foco. */
  loading?: boolean;
  /** Nome acessível do botão da seta. */
  menuLabel?: string;
  /** Lado preferido do menu; o Radix inverte sozinho quando falta espaço. */
  side?: 'top' | 'bottom';
  /** Aplicado ao contêiner que junta os dois botões. */
  className?: string;
}

const PART = 'inline-flex items-center justify-center focus-visible:z-10';

/** Altura e larguras por tamanho: a seta é um quadrado da altura do botão. */
const SIZE = {
  md: { height: 'h-8', main: 'px-3', arrow: 'w-8' },
  lg: { height: 'h-10', main: 'px-4', arrow: 'w-10' },
} as const;

function SplitMenuItem({ item, onSelect }: { item: SplitItem; onSelect: (item: SplitItem) => void }) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <MenuItem
      icon={item.leading}
      disabled={item.disabled}
      textValue={typeof item.label === 'string' ? item.label : undefined}
      aria-labelledby={labelId}
      aria-describedby={item.description ? descriptionId : undefined}
      onSelect={() => onSelect(item)}
    >
      <span className="flex min-w-0 flex-col">
        <span id={labelId}>{item.label}</span>
        {item.description ? (
          <span id={descriptionId} className="text-xs text-fg-muted">
            {item.description}
          </span>
        ) : null}
      </span>
    </MenuItem>
  );
}

/**
 * Dois botões colados: ação principal + seta que abre um menu de alternativas.
 * O menu abre para cima por padrão; Enter, Espaço e setas abrem; Esc fecha e devolve o foco à seta.
 * `ref` aponta para o botão principal.
 */
export const SplitButton = forwardRef<HTMLButtonElement, SplitButtonProps>(function SplitButton(
  { label, onClick, items, onSelectItem, variant = 'ink', size = 'md', disabled, loading = false, menuLabel = 'Mais opções de envio', side = 'top', className },
  ref,
) {
  const [open, setOpen] = useState(false);
  const interactive = !disabled && !loading;
  const dims = SIZE[size];
  const Chevron = side === 'top' ? ChevronUp : ChevronDown;

  const handleMainClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick();
  };

  // Radix só abre com Enter/Espaço/ArrowDown; como o menu sobe, ArrowUp também deve abrir.
  const handleArrowKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' && interactive) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (next && !interactive) return;
    setOpen(next);
  };

  return (
    <div className={cn('inline-flex', className)}>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-busy={loading || undefined}
        aria-disabled={loading || undefined}
        onClick={handleMainClick}
        className={cn(
          BUTTON_BASE,
          PART,
          dims.height,
          dims.main,
          'rounded-l rounded-r-none',
          buttonSurface(variant, interactive),
          disabled && 'cursor-not-allowed opacity-50',
          loading && 'cursor-progress',
        )}
      >
        <ButtonContent loading={loading}>{label}</ButtonContent>
      </button>

      <Menu open={open} onOpenChange={handleOpenChange}>
        <MenuTrigger asChild disabled={disabled} onKeyDown={handleArrowKeyDown}>
          <button
            type="button"
            disabled={disabled}
            aria-label={menuLabel}
            aria-disabled={loading || undefined}
            className={cn(
              BUTTON_BASE,
              PART,
              dims.height,
              dims.arrow,
              'rounded-l-none rounded-r border-l border-fg-inverse/30',
              buttonSurface(variant, interactive),
              disabled && 'cursor-not-allowed opacity-50',
              loading && 'cursor-progress',
            )}
          >
            <Chevron aria-hidden className="h-4 w-4" />
          </button>
        </MenuTrigger>
        <MenuContent side={side} align="end" className="min-w-56">
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {item.separatorBefore && index > 0 ? <MenuSeparator /> : null}
              <SplitMenuItem item={item} onSelect={onSelectItem} />
            </Fragment>
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
});
