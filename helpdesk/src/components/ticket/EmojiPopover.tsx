import * as Popover from '@radix-ui/react-popover';
import { keepFocusIfPlaced } from '@/components/ui/focusUtils';
import { useState, type ReactElement } from 'react';
import { cn } from '@/lib/cn';
import { foldText } from '@/components/ui/fieldUtils';

type E = [emoji: string, name: string];
export const EMOJI_CATEGORIES: Array<{ id: string; label: string; icon: string; items: E[] }> = [
  { id: 'rostos', label: 'Rostos', icon: '😀', items: [['😀', 'sorriso'], ['😄', 'sorriso feliz'], ['😊', 'sorriso gentil'], ['😉', 'piscadinha'], ['😍', 'apaixonado'], ['😂', 'chorando de rir'], ['🙂', 'sorriso leve'], ['😌', 'aliviado'], ['🤔', 'pensando'], ['😅', 'suor frio'], ['😢', 'triste'], ['😕', 'confuso'], ['😮', 'surpreso'], ['🙏', 'por favor obrigado']] },
  { id: 'gestos', label: 'Gestos', icon: '👍', items: [['👍', 'joinha'], ['👎', 'negativo'], ['👋', 'tchau olá'], ['👏', 'palmas'], ['🙌', 'mãos para cima'], ['🤝', 'aperto de mão'], ['👌', 'ok'], ['✌️', 'paz'], ['💪', 'força'], ['👀', 'olhos']] },
  { id: 'simbolos', label: 'Símbolos', icon: '✅', items: [['✅', 'certo confirmado'], ['❌', 'erro cancelado'], ['⚠️', 'atenção'], ['❓', 'pergunta'], ['❗', 'exclamação'], ['⭐', 'estrela'], ['❤️', 'coração'], ['🔥', 'fogo'], ['🎉', 'festa parabéns'], ['💡', 'ideia']] },
  { id: 'objetos', label: 'Objetos', icon: '📎', items: [['📎', 'clipe anexo'], ['📧', 'e-mail'], ['📞', 'telefone'], ['💻', 'computador'], ['📱', 'celular'], ['🔒', 'cadeado'], ['🔑', 'chave'], ['📦', 'pacote entrega'], ['💳', 'cartão'], ['🕐', 'relógio hora']] },
];

export function EmojiPopover({ onPick, trigger }: { onPick: (emoji: string) => void; trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(EMOJI_CATEGORIES[0]!.id);
  const [q, setQ] = useState('');
  const term = foldText(q.trim());
  const list = term
    ? EMOJI_CATEGORIES.flatMap((c) => c.items).filter(([, n]) => foldText(n).includes(term))
    : EMOJI_CATEGORIES.find((c) => c.id === tab)!.items;
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          aria-label="Emojis"
          onCloseAutoFocus={keepFocusIfPlaced}
          className="anim-pop-in z-[80] w-72 rounded border border-line bg-surface p-2 shadow-pop"
        >
          <input
            aria-label="Encontrar um emoji"
            placeholder="Encontrar um emoji"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-2 h-8 w-full rounded border border-line-strong bg-surface px-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-action focus:shadow-focus"
          />
          {!term ? (
            <div role="tablist" aria-label="Categorias" className="mb-2 flex gap-1 border-b border-line pb-1">
              {EMOJI_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === c.id}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => setTab(c.id)}
                  className={cn('h-8 w-8 rounded text-md outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus', tab === c.id && 'bg-surface-2')}
                >
                  {c.icon}
                </button>
              ))}
            </div>
          ) : null}
          {list.length === 0 ? (
            <p className="py-3 text-center text-xs text-fg-muted">Nenhum emoji encontrado.</p>
          ) : (
            <div role="group" aria-label="Resultados" className="grid max-h-40 grid-cols-7 gap-1 overflow-y-auto">
              {list.map(([emoji, name]) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={name}
                  title={name}
                  onClick={() => { onPick(emoji); setOpen(false); }}
                  className="h-8 w-8 rounded text-md outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
