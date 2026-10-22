import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fieldBoxSelf, foldText, mergeRefs } from './fieldUtils';
import { isFocusAdrift } from './focusUtils';
import { OPTION_ACTIVE_CMDK } from './optionStyles';
import { Skeleton } from './Skeleton';

export interface ComboOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface ComboboxProps {
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Modo estático: a busca filtra esta lista (sem acentos, por rótulo e descrição). */
  options?: ComboOption[];
  /** Modo assíncrono: chamado ao abrir e a cada busca (com debounce de 200 ms). Tem prioridade sobre `options`. */
  loadOptions?: (query: string) => Promise<ComboOption[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  id?: string;
  className?: string;
  /** Conteúdo de cada item da lista (substitui rótulo + descrição). O ✓ do selecionado continua sendo desenhado aqui. */
  renderOption?: (option: ComboOption) => ReactNode;
}

const DEBOUNCE_MS = 200;
const NO_OPTIONS: ComboOption[] = [];

type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Pontua rótulo e descrição; o `value` do cmdk (id da opção) fica fora da busca. 0 = não aparece. */
function comboFilter(_value: string, search: string, keywords: string[] = []): number {
  const query = foldText(search.trim());
  if (!query) return 1;
  const label = foldText(keywords[0] ?? '');
  const description = foldText(keywords[1] ?? '');
  if (label.startsWith(query)) return 1;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 0.8;
  if (label.includes(query)) return 0.6;
  if (description.includes(query)) return 0.4;
  return 0;
}

const contentStyle = { width: 'var(--radix-popover-trigger-width)' } as const;

/**
 * Select pesquisável: gatilho `role="combobox"` + Popover (Radix) com lista cmdk (`role="listbox"`).
 * Esc e clique fora fecham e devolvem o foco ao gatilho; abre para cima quando falta espaço embaixo.
 * Dentro do popover existe um segundo `role="combobox"` (o campo de busca do cmdk).
 */
export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  {
    value,
    onValueChange,
    options,
    loadOptions,
    placeholder,
    searchPlaceholder = 'Pesquisar...',
    emptyText = 'Nenhum resultado encontrado.',
    clearable = false,
    invalid,
    disabled,
    className,
    renderOption,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired,
    id,
  },
  forwardedRef,
) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const ref = useMemo(() => mergeRefs(forwardedRef, triggerRef), [forwardedRef]);

  const isAsync = loadOptions !== undefined;
  const loadRef = useRef(loadOptions);
  loadRef.current = loadOptions;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [asyncState, setAsyncState] = useState<{ status: AsyncStatus; options: ComboOption[] }>({
    status: 'idle',
    options: NO_OPTIONS,
  });
  const [listboxId, setListboxId] = useState<string | undefined>(undefined);
  // Opções já vistas (modo assíncrono): mantém o rótulo do selecionado mesmo quando a lista recarrega sem ele.
  const known = useRef(new Map<string, ComboOption>());
  const [, bumpKnown] = useState(0);

  const items = isAsync ? asyncState.options : (options ?? NO_OPTIONS);
  const selected =
    value === null ? undefined : (options?.find((o) => o.value === value) ?? known.current.get(value));

  // `aria-controls` do gatilho deve apontar para o listbox do cmdk, cujo id é interno: lê do DOM quando monta.
  const commandRef = useCallback((node: HTMLDivElement | null) => {
    setListboxId(node?.querySelector('[cmdk-list]')?.id || undefined);
  }, []);

  const remember = (list: ComboOption[]) => {
    for (const option of list) known.current.set(option.value, option);
  };

  // Carrega ao abrir e a cada busca. A busca espera o debounce; abrir/limpar a busca vai direto.
  useEffect(() => {
    if (!open) return;
    const load = loadRef.current;
    if (!load) return;
    let cancelled = false;
    setAsyncState((s) => ({ ...s, status: 'loading' }));
    const timer = window.setTimeout(
      () => {
        Promise.resolve()
          .then(() => load(search))
          .then((result) => {
            if (cancelled) return;
            remember(result);
            setAsyncState({ status: 'ready', options: result });
            // Sem busca, destaca o selecionado se ele veio na lista; senão o cmdk destaca o primeiro.
            setHighlight(search === '' && value !== null && result.some((o) => o.value === value && !o.disabled) ? value : '');
          })
          .catch(() => {
            if (!cancelled) setAsyncState((s) => ({ ...s, status: 'error' }));
          });
      },
      search === '' ? 0 : DEBOUNCE_MS,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, attempt]);

  // Valor inicial sem rótulo conhecido (modo assíncrono): busca silenciosa só para exibir o nome no gatilho.
  useEffect(() => {
    const load = loadRef.current;
    if (!load || value === null || known.current.has(value)) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => load(''))
      .then((result) => {
        if (cancelled) return;
        remember(result);
        bumpKnown((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setHighlight(!isAsync && options?.some((o) => o.value === value && !o.disabled) ? (value ?? '') : '');
      if (isAsync) setAsyncState((s) => ({ ...s, status: 'loading' }));
    } else {
      setSearch('');
    }
  };

  const choose = (option: ComboOption) => {
    known.current.set(option.value, option);
    if (option.value !== value) onValueChange(option.value);
    handleOpenChange(false);
  };

  const clear = () => {
    onValueChange(null);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) handleOpenChange(true);
    }
  };

  const showClear = clearable && !disabled && value !== null;
  const loading = isAsync && (asyncState.status === 'loading' || asyncState.status === 'idle');
  const failed = isAsync && asyncState.status === 'error';
  const showEmpty = !loading && !failed;
  const visibleItems = loading || failed ? NO_OPTIONS : items;

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <div className={cn('relative', className)}>
        <Popover.Trigger asChild>
          <button
            ref={ref}
            id={id}
            type="button"
            role="combobox"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
            aria-required={ariaRequired}
            aria-invalid={invalid ? true : undefined}
            aria-haspopup="listbox"
            aria-expanded={open}
            {...(listboxId ? { 'aria-controls': listboxId } : {})}
            onKeyDown={handleTriggerKeyDown}
            className={cn(
              'flex h-8 w-full items-center rounded pl-2 text-left text-sm focus-visible:outline-none',
              showClear ? 'pr-14' : 'pr-8',
              fieldBoxSelf({ invalid, disabled }),
            )}
          >
            {selected ? (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {selected.icon ? <span className="flex shrink-0 items-center text-fg-muted">{selected.icon}</span> : null}
                <span className="truncate">{selected.label}</span>
              </span>
            ) : (
              <span className={cn('min-w-0 flex-1 truncate', !disabled && 'text-fg-muted')}>{placeholder}</span>
            )}
          </button>
        </Popover.Trigger>
        {showClear ? (
          <button
            type="button"
            aria-label="Limpar seleção"
            onClick={clear}
            className="absolute right-6 top-1 flex size-6 items-center justify-center rounded text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className={cn('pointer-events-none absolute right-2 top-2 size-4', disabled ? 'text-fg-subtle' : 'text-fg-muted')}
        />
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={8}
          avoidCollisions
          role="presentation"
          // Clique fora não devolve o foco sozinho (Popover não modal): se caiu no "nada", volta ao gatilho.
          onCloseAutoFocus={() => {
            if (isFocusAdrift()) triggerRef.current?.focus();
          }}
          style={contentStyle}
          className="anim-pop-in z-[80] min-w-56 overflow-hidden rounded border border-line bg-surface text-sm text-fg shadow-menu focus-visible:shadow-menu focus-visible:outline-none"
        >
          <Command
            ref={commandRef}
            label={searchPlaceholder}
            shouldFilter={!isAsync}
            filter={comboFilter}
            value={highlight}
            onValueChange={setHighlight}
            loop
          >
            <div className="flex items-center gap-2 border-b border-line px-2 focus-within:border-action">
              <Search aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
              <Command.Input
                autoFocus
                value={search}
                onValueChange={setSearch}
                placeholder={searchPlaceholder}
                className="h-8 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-none"
              />
            </div>
            <Command.List label={ariaLabel ?? placeholder ?? 'Opções'} className="max-h-60 overflow-y-auto p-1">
              {visibleItems.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Command.Item
                    key={option.value}
                    value={option.value}
                    keywords={[option.label, option.description ?? '']}
                    disabled={option.disabled}
                    onSelect={() => choose(option)}
                    className={cn(
                      'flex min-h-8 cursor-default select-none items-center gap-2 rounded-xs px-2 py-1 text-sm text-fg data-[disabled=true]:cursor-not-allowed data-[disabled=true]:text-fg-subtle',
                      OPTION_ACTIVE_CMDK,
                    )}
                  >
                    {renderOption ? (
                      <span className="min-w-0 flex-1">{renderOption(option)}</span>
                    ) : (
                      <>
                        {option.icon ? <span className="flex shrink-0 items-center text-fg-muted">{option.icon}</span> : null}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{option.label}</span>
                          {option.description ? (
                            <span className="truncate text-xs text-fg-muted">{option.description}</span>
                          ) : null}
                        </span>
                      </>
                    )}
                    {isSelected ? (
                      <>
                        <Check aria-hidden="true" className="size-4 shrink-0 text-action" />
                        <span className="sr-only">(selecionado)</span>
                      </>
                    ) : null}
                  </Command.Item>
                );
              })}
            </Command.List>
            {loading ? (
              <div role="status" className="space-y-2 p-3">
                <span className="sr-only">Carregando...</span>
                <Skeleton className="h-4" width="100%" />
                <Skeleton className="h-4" width="75%" />
                <Skeleton className="h-4" width="50%" />
              </div>
            ) : null}
            {failed ? (
              <div role="alert" className="flex flex-col items-start gap-1 p-3 text-sm">
                <span className="text-danger">Não foi possível carregar as opções.</span>
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="min-h-6 rounded-xs text-sm font-semibold text-action transition-colors duration-100 hover:text-action-hover hover:underline"
                >
                  Tentar novamente
                </button>
              </div>
            ) : null}
            <div role="status" aria-live="polite">
              {showEmpty ? (
                <Command.Empty className="px-3 py-3 text-center text-sm text-fg-muted">{emptyText}</Command.Empty>
              ) : null}
            </div>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
