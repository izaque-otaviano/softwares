import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fieldBoxSelf } from './fieldUtils';
import { OPTION_ACTIVE_RADIX } from './optionStyles';

export interface SelectOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  /** `undefined` mostra o placeholder. `''` seleciona a opção com `value: ''` (ex.: "—"), se existir. */
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  id?: string;
  className?: string;
}

/**
 * O Radix Select não aceita `value=""` em um item (reserva a string vazia para "sem seleção").
 * Mapeamos a opção vazia (usada para "—") para um valor interno e de volta.
 */
const EMPTY = '__select_empty__';
const toInternal = (value: string): string => (value === '' ? EMPTY : value);
const fromInternal = (value: string): string => (value === EMPTY ? '' : value);

const contentStyle = {
  minWidth: 'var(--radix-select-trigger-width)',
  maxHeight: 'min(var(--radix-select-content-available-height), 20rem)',
} as const;

/** Select de 32px (Radix). Abre para baixo ou para cima conforme o espaço; Esc fecha e devolve o foco ao gatilho. */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { value, onValueChange, options, placeholder, invalid, disabled, className, ...triggerProps },
  ref,
) {
  const hasEmptyOption = options.some((o) => o.value === '');
  const internalValue = value === undefined || (value === '' && !hasEmptyOption) ? '' : toInternal(value);

  return (
    <div className={cn('block', className)}>
      <RadixSelect.Root
        value={internalValue}
        onValueChange={(next) => onValueChange(fromInternal(next))}
        disabled={disabled}
      >
        <RadixSelect.Trigger
          ref={ref}
          {...triggerProps}
          aria-invalid={invalid ? true : undefined}
          className={cn(
            'flex h-8 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm',
            'data-[placeholder]:text-fg-muted data-[disabled]:data-[placeholder]:text-fg-subtle focus-visible:outline-none',
            fieldBoxSelf({ invalid, disabled }),
          )}
        >
          <RadixSelect.Value placeholder={placeholder} className="min-w-0 flex-1 overflow-hidden" />
          <RadixSelect.Icon asChild>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={8}
            avoidCollisions
            style={contentStyle}
            className="anim-pop-in z-[80] overflow-hidden rounded border border-line bg-surface text-sm text-fg shadow-menu focus-visible:shadow-menu"
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={toInternal(option.value)}
                  disabled={option.disabled}
                  className={cn(
                    'flex h-8 cursor-default select-none items-center gap-2 rounded-xs px-2 text-sm text-fg outline-none focus-visible:shadow-none data-[disabled]:cursor-not-allowed data-[disabled]:text-fg-subtle',
                    OPTION_ACTIVE_RADIX,
                  )}
                >
                  <RadixSelect.ItemText className="min-w-0 flex-1 overflow-hidden">
                    <span className="flex min-w-0 items-center gap-2">
                      {option.icon ? <span className="flex shrink-0 items-center text-fg-muted">{option.icon}</span> : null}
                      <span className="truncate">{option.label}</span>
                    </span>
                  </RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="ml-auto flex shrink-0 items-center pl-2">
                    <Check aria-hidden="true" className="size-4 text-action" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
});
