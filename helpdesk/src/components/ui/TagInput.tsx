import { forwardRef, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent, MouseEvent } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fieldBoxWithin, foldText, mergeRefs } from './fieldUtils';
import { optionActiveState } from './optionStyles';

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** Sugestões mostradas ao digitar (e com a seta para baixo). Ativa o padrão ARIA de combobox no campo. */
  suggestions?: string[];
  maxTags?: number;
  /** Devolve a mensagem de erro (a tag é recusada e o texto fica no campo) ou `null` se a tag é válida. */
  validate?: (tag: string) => string | null;
  invalid?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  /** Vai para o `<input>` (assim `<label htmlFor>` funciona). */
  id?: string;
  className?: string;
}

interface Row {
  kind: 'suggestion' | 'new';
  label: string;
}

const MAX_SUGGESTIONS = 6;
const SEPARATORS = /[\s,]+/;

/**
 * Campo de tags. Enter, vírgula ou Tab (com texto) adicionam; Backspace no campo vazio remove a última;
 * colar separa por vírgula, espaço e quebra de linha; duplicatas (sem diferenciar maiúsculas/acentos) são ignoradas.
 * Tab só é interceptado quando adiciona a tag (texto recusado ou Shift+Tab deixam o foco sair). Os botões "Remover" dos
 * chips não entram na ordem de Tab: ← no campo vazio vai aos chips, ←/→ andam entre eles; ↑/↓ navegam pelas sugestões.
 */
export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(function TagInput(
  {
    value,
    onChange,
    placeholder,
    suggestions,
    maxTags,
    validate,
    invalid,
    disabled,
    className,
    id,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired,
  },
  forwardedRef,
) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const messageId = `${baseId}-message`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ref = useMemo(() => mergeRefs(forwardedRef, inputRef), [forwardedRef]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chipButtons = useRef<Array<HTMLButtonElement | null>>([]);

  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const hasSuggestions = suggestions !== undefined;
  const query = foldText(draft.trim());

  const rows = useMemo<Row[]>(() => {
    if (!suggestions) return [];
    const unused = suggestions.filter((s) => !value.some((v) => foldText(v) === foldText(s)));
    const matches = query ? unused.filter((s) => foldText(s).includes(query)) : showAll ? unused : [];
    const result: Row[] = matches.slice(0, MAX_SUGGESTIONS).map((label) => ({ kind: 'suggestion', label }));
    const exists = [...value, ...suggestions].some((t) => foldText(t) === query);
    if (query && !exists) result.push({ kind: 'new', label: draft.trim() });
    return result;
  }, [suggestions, value, query, showAll, draft]);

  const popupOpen = !disabled && focused && !dismissed && rows.length > 0;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  /** Tenta adicionar; devolve a primeira mensagem de erro (validação ou limite), se houve. */
  const addTags = (candidates: string[]): string | null => {
    const next = [...value];
    let error: string | null = null;
    for (const raw of candidates) {
      const tag = raw.trim();
      if (!tag) continue;
      if (next.some((t) => foldText(t) === foldText(tag))) continue;
      if (maxTags !== undefined && next.length >= maxTags) {
        error ??= `Máximo de ${maxTags} ${maxTags === 1 ? 'tag' : 'tags'}.`;
        break;
      }
      const problem = validate?.(tag) ?? null;
      if (problem) {
        error ??= problem;
        continue;
      }
      next.push(tag);
    }
    if (next.length !== value.length) {
      onChange(next);
      setAnnouncement(`${next.length - value.length === 1 ? 'Tag adicionada' : 'Tags adicionadas'}: ${next.slice(value.length).join(', ')}`);
    }
    return error;
  };

  const resetPopup = () => {
    setActiveIndex(-1);
    setShowAll(false);
  };

  /** Devolve `true` se o texto foi consumido (tag adicionada ou duplicata ignorada); `false` se foi recusado. */
  const commitDraft = (text: string = draft): boolean => {
    const error = addTags([text]);
    setMessage(error);
    if (error) return false;
    setDraft('');
    resetPopup();
    return true;
  };

  const removeAt = (index: number) => {
    const tag = value[index];
    if (tag === undefined) return;
    onChange(value.filter((_, i) => i !== index));
    setAnnouncement(`Tag removida: ${tag}`);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setMessage(null);
    setDismissed(false);
    setActiveIndex(-1);
    if (!text.includes(',')) {
      setDraft(text);
      return;
    }
    // Vírgula digitada (ou vinda de teclado móvel): fecha os trechos completos e deixa o resto no campo.
    const parts = text.split(',');
    const rest = parts.pop() ?? '';
    const error = addTags(parts);
    if (error) {
      setMessage(error);
      setDraft([...parts, rest].map((p) => p.trim()).filter(Boolean).join(' '));
    } else {
      setDraft(rest.trimStart());
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!SEPARATORS.test(text.trim())) return; // um único trecho: cola normalmente no campo
    event.preventDefault();
    const error = addTags(text.split(SEPARATORS));
    setMessage(error);
    resetPopup();
  };

  const pickRow = (row: Row): boolean => {
    const accepted = commitDraft(row.label);
    inputRef.current?.focus();
    return accepted;
  };

  const focusChip = (index: number) => chipButtons.current[index]?.focus();

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Enter': {
        const row = popupOpen ? rows[activeIndex] : undefined;
        if (row) {
          event.preventDefault();
          pickRow(row);
        } else if (draft.trim()) {
          event.preventDefault();
          commitDraft();
        }
        break;
      }
      case 'Tab': {
        // Shift+Tab e Tab sem texto seguem o fluxo normal do navegador. Com texto, Tab adiciona a tag e mantém o foco
        // para a próxima; se o texto for recusado (validate ou maxTags) o Tab NÃO é interceptado, senão o foco ficaria
        // preso no campo (WCAG 2.1.2). A mensagem de erro continua ligada ao campo por aria-describedby.
        if (event.shiftKey || !draft.trim()) break;
        const row = popupOpen ? rows[activeIndex] : undefined;
        const accepted = row ? pickRow(row) : commitDraft();
        if (accepted) event.preventDefault();
        break;
      }
      case 'Backspace': {
        if (draft === '' && value.length > 0) {
          event.preventDefault();
          removeAt(value.length - 1);
        }
        break;
      }
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!hasSuggestions) break;
        event.preventDefault();
        if (!popupOpen) {
          setDismissed(false);
          setShowAll(true);
          setActiveIndex(0);
          break;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((index) => (index + step + rows.length) % rows.length);
        break;
      }
      case 'ArrowLeft': {
        if (draft === '' && value.length > 0) {
          event.preventDefault();
          focusChip(value.length - 1);
        }
        break;
      }
      case 'Escape': {
        if (popupOpen) {
          setDismissed(true);
          setActiveIndex(-1);
        }
        break;
      }
      default:
        break;
    }
  };

  const handleChipKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusChip(Math.max(0, index - 1));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (index >= value.length - 1) inputRef.current?.focus();
      else focusChip(index + 1);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      removeAt(index);
      inputRef.current?.focus();
    }
  };

  const focusInputFromContainer = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input')) return;
    event.preventDefault();
    inputRef.current?.focus();
  };

  const describedBy = [ariaDescribedBy, message ? messageId : undefined].filter(Boolean).join(' ') || undefined;
  const comboboxProps = hasSuggestions
    ? {
        role: 'combobox' as const,
        'aria-autocomplete': 'list' as const,
        'aria-expanded': popupOpen,
        'aria-controls': popupOpen ? listId : undefined,
        'aria-activedescendant': popupOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined,
      }
    : {};

  return (
    <div className={cn('block', className)}>
      <Popover.Root open={popupOpen} onOpenChange={(next) => !next && setDismissed(true)}>
        <Popover.Anchor asChild>
          <div
            ref={containerRef}
            onMouseDown={focusInputFromContainer}
            className={cn(
              fieldBoxWithin({ invalid: invalid || message !== null, disabled }),
              'min-h-8 flex-wrap gap-1 px-1 py-0.5',
              !disabled && 'cursor-text',
            )}
          >
            {value.map((tag, index) => (
              <span
                key={tag}
                className="inline-flex h-6 max-w-full items-center rounded bg-surface-2 pl-2 text-xs text-fg"
              >
                <span className="truncate">{tag}</span>
                <button
                  ref={(node) => {
                    chipButtons.current[index] = node;
                  }}
                  type="button"
                  // Fora da ordem de Tab: o Tab entra direto no campo; os chips ficam a ←/→ (e ao clique).
                  tabIndex={-1}
                  disabled={disabled}
                  aria-label={`Remover tag ${tag}`}
                  onClick={() => {
                    removeAt(index);
                    inputRef.current?.focus();
                  }}
                  onKeyDown={(event) => handleChipKeyDown(event, index)}
                  className="ml-0.5 flex size-6 shrink-0 items-center justify-center rounded text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg disabled:cursor-not-allowed"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            ))}
            <input
              {...comboboxProps}
              ref={ref}
              id={id}
              type="text"
              value={draft}
              disabled={disabled}
              placeholder={value.length === 0 ? placeholder : undefined}
              aria-label={ariaLabel}
              aria-describedby={describedBy}
              aria-required={ariaRequired}
              aria-invalid={invalid || message !== null ? true : undefined}
              autoComplete="off"
              spellCheck={false}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => {
                setFocused(true);
                setDismissed(false);
              }}
              onBlur={() => {
                setFocused(false);
                resetPopup();
              }}
              className="h-6 min-w-20 flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-none disabled:cursor-not-allowed"
            />
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            side="bottom"
            sideOffset={4}
            collisionPadding={8}
            avoidCollisions
            role="presentation"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              // Clicar no próprio campo não fecha a lista.
              if (containerRef.current?.contains(event.target as Node)) event.preventDefault();
            }}
            style={{ minWidth: 'var(--radix-popover-trigger-width)' }}
            className="anim-pop-in z-[80] overflow-hidden rounded border border-line bg-surface p-1 text-sm text-fg shadow-menu focus-visible:shadow-menu focus-visible:outline-none"
          >
            <div role="listbox" id={listId} aria-label="Sugestões de tags">
              {rows.map((row, index) => (
                <div
                  key={`${row.kind}:${row.label}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  // Mantém o foco no campo ao clicar na opção.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => pickRow(row)}
                  className={cn(
                    'flex min-h-8 cursor-default select-none items-center gap-2 rounded-xs px-2 py-1 text-sm text-fg',
                    optionActiveState(index === activeIndex),
                  )}
                >
                  {row.kind === 'new' ? (
                    <>
                      <Plus aria-hidden="true" className="size-4 shrink-0 text-action" />
                      <span className="truncate">Adicionar tag &ldquo;{row.label}&rdquo;</span>
                    </>
                  ) : (
                    <span className="truncate">{row.label}</span>
                  )}
                </div>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div aria-live="polite">
        {message ? (
          <p id={messageId} className="mt-1 text-xs text-danger">
            {message}
          </p>
        ) : null}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
});
