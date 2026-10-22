import * as Popover from '@radix-ui/react-popover';
import { keepFocusIfPlaced } from '@/components/ui/focusUtils';
import type { Editor } from '@tiptap/react';
import {
  Bold, Code, Heading2, Image as ImageIcon, IndentDecrease, IndentIncrease, Italic, Link as LinkIcon, List, ListOrdered, Mic, Minus, Paperclip,
  Palette, Quote, RemoveFormatting, Smile, Table, Type, Underline as UnderlineIcon, Wand2,
} from 'lucide-react';
import { forwardRef, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner, Tooltip, TooltipProvider } from '@/components/ui';
import { cn } from '@/lib/cn';
import { AiMenu } from './AiMenu';
import { EmojiPopover } from './EmojiPopover';

interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string;
  icon: ReactNode;
  active?: boolean;
  /** Texto do tooltip quando desabilitado (explica o motivo). */
  hint?: string;
}

export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { label, icon, active, hint, disabled, className, ...rest },
  ref,
) {
  const button = (
    <button
      {...rest}
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Não rouba o foco do editor ao clicar.
      onMouseDown={(e) => { e.preventDefault(); rest.onMouseDown?.(e); }}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-fg-muted outline-none transition-colors duration-100 focus-visible:shadow-focus',
        active ? 'bg-surface-2 text-fg' : 'hover:bg-hover hover:text-fg',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-fg-muted',
        className,
      )}
    >
      <span aria-hidden className="inline-flex [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
    </button>
  );
  if (disabled) {
    return (
      <Tooltip content={hint ?? label} side="top">
        <span tabIndex={0} className="inline-flex rounded outline-none focus-visible:shadow-focus" aria-label={`${label} (indisponível)`}>
          {button}
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={label} side="top">
      {button}
    </Tooltip>
  );
});

const NOT_AVAILABLE = 'Indisponível neste protótipo';

function FormatBar({ editor }: { editor: Editor }) {
  const run = (fn: () => void) => () => fn();
  return (
    <div role="toolbar" aria-label="Formatação" className="flex flex-wrap items-center gap-0.5">
      <ToolButton label="Título" icon={<Heading2 />} active={editor.isActive('heading', { level: 2 })} onClick={run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} />
      <ToolButton label="Negrito" icon={<Bold />} active={editor.isActive('bold')} onClick={run(() => editor.chain().focus().toggleBold().run())} />
      <ToolButton label="Itálico" icon={<Italic />} active={editor.isActive('italic')} onClick={run(() => editor.chain().focus().toggleItalic().run())} />
      <ToolButton label="Sublinhado" icon={<UnderlineIcon />} active={editor.isActive('underline')} onClick={run(() => editor.chain().focus().toggleUnderline().run())} />
      <ToolButton label="Cor do texto" icon={<Palette />} disabled hint={NOT_AVAILABLE} />
      <ToolButton label="Lista" icon={<List />} active={editor.isActive('bulletList')} onClick={run(() => editor.chain().focus().toggleBulletList().run())} />
      <ToolButton label="Lista numerada" icon={<ListOrdered />} active={editor.isActive('orderedList')} onClick={run(() => editor.chain().focus().toggleOrderedList().run())} />
      <ToolButton label="Recuar" icon={<IndentIncrease />} disabled={!editor.can().sinkListItem('listItem')} hint="Disponível dentro de listas" onClick={run(() => editor.chain().focus().sinkListItem('listItem').run())} />
      <ToolButton label="Avançar" icon={<IndentDecrease />} disabled={!editor.can().liftListItem('listItem')} hint="Disponível dentro de listas" onClick={run(() => editor.chain().focus().liftListItem('listItem').run())} />
      <ToolButton label="Citação" icon={<Quote />} active={editor.isActive('blockquote')} onClick={run(() => editor.chain().focus().toggleBlockquote().run())} />
      <ToolButton label="Código" icon={<Code />} active={editor.isActive('codeBlock')} onClick={run(() => editor.chain().focus().toggleCodeBlock().run())} />
      <ToolButton label="Imagem" icon={<ImageIcon />} disabled hint={NOT_AVAILABLE} />
      <ToolButton label="Divisor" icon={<Minus />} onClick={run(() => editor.chain().focus().setHorizontalRule().run())} />
      <ToolButton label="Tabela" icon={<Table />} disabled hint={NOT_AVAILABLE} />
    </div>
  );
}

function LinkPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const apply = () => {
    const href = url.trim();
    if (!href) return;
    const safe = /^(https?:|mailto:|tel:)/i.test(href) ? href : `https://${href}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run();
    setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setUrl((editor.getAttributes('link').href as string | undefined) ?? ''); }}>
      <Popover.Trigger asChild>
        <ToolButton label="Link" icon={<LinkIcon />} active={editor.isActive('link')} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={6} aria-label="Inserir link" onCloseAutoFocus={keepFocusIfPlaced} className="anim-pop-in z-[80] flex w-72 items-center gap-1 rounded border border-line bg-surface p-2 shadow-pop">
          <input
            aria-label="Endereço do link"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply(); } }}
            className="h-8 min-w-0 flex-1 rounded border border-line-strong bg-surface px-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-action focus:shadow-focus"
          />
          <button type="button" onClick={apply} className="h-8 rounded bg-action px-3 text-sm font-semibold text-fg-inverse outline-none hover:bg-action-hover focus-visible:shadow-focus">Aplicar</button>
          {editor.isActive('link') ? (
            <button type="button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setOpen(false); }} className="h-8 rounded px-2 text-sm text-fg outline-none hover:bg-hover focus-visible:shadow-focus">Remover</button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface ComposerToolbarProps {
  editor: Editor | null;
  note: boolean;
  aiBusy: boolean;
  onAi: (action: string) => void;
  onFiles: (files: File[]) => void;
}

export function ComposerToolbar({ editor, note, aiBusy, onAi, onFiles }: ComposerToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  if (!editor) return <div className="h-8" />;
  return (
    <TooltipProvider>
      <div role="toolbar" aria-label="Ferramentas do editor" className="flex h-8 items-center gap-0.5">
        {!note ? (
          <ToolButton label="Limpar formatação" icon={<RemoveFormatting />} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} />
        ) : null}
        <Popover.Root>
          <Popover.Trigger asChild>
            <ToolButton label="Formatação do texto" icon={<Type />} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="top" align="start" sideOffset={6} aria-label="Formatação do texto" onCloseAutoFocus={keepFocusIfPlaced} className="anim-pop-in z-[80] max-w-sm rounded border border-line bg-surface p-1 shadow-pop">
              <FormatBar editor={editor} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <EmojiPopover onPick={(emoji) => editor.chain().focus().insertContent(emoji).run()} trigger={<ToolButton label="Emoji" icon={<Smile />} />} />
        <ToolButton label="Anexar arquivo" icon={<Paperclip />} onClick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          aria-label="Selecionar arquivos"
          data-testid="file-input"
          onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
        <LinkPopover editor={editor} />
        <AiMenu
          busy={aiBusy}
          onRun={onAi}
          trigger={<ToolButton label="Assistente de IA" icon={aiBusy ? <Spinner label="" /> : <Wand2 />} className="text-ai hover:text-ai" />}
        />
        <ToolButton label="Microfone" icon={<Mic />} disabled hint="Ditado por voz indisponível neste protótipo" />
      </div>
    </TooltipProvider>
  );
}
