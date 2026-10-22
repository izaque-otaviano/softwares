import * as Popover from '@radix-ui/react-popover';
import { keepFocusIfPlaced } from '@/components/ui/focusUtils';
import { Send } from 'lucide-react';
import { useState, type ReactElement } from 'react';

export const AI_ACTIONS = ['Expandir', 'Simplificar', 'Reescrever no seu tom', 'Tornar mais amigável', 'Tornar mais formal'] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

/** Transformação mockada (sem IA de verdade). `action` pode ser uma das ações fixas ou um pedido livre. */
export function mockAiTransform(text: string, action: string): string {
  const t = text.trim();
  switch (action) {
    case 'Expandir':
      return `${t}\n\nSe precisar de mais detalhes ou de algum passo a passo, é só me avisar que explico com calma.`;
    case 'Simplificar': {
      const first = t.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
      return first.length < t.length ? first : t;
    }
    case 'Reescrever no seu tom':
      return `Olá! ${t} Qualquer dúvida, estou por aqui.`;
    case 'Tornar mais amigável':
      return `Oi, tudo bem? 😊 ${t} Fico à disposição!`;
    case 'Tornar mais formal':
      return `Prezado(a), ${t.charAt(0).toLocaleLowerCase('pt-BR')}${t.slice(1)} Permanecemos à disposição para quaisquer esclarecimentos.`;
    default:
      return `${t}\n\n(Ajustado conforme o pedido: ${action})`;
  }
}

export function AiMenu({ trigger, busy, onRun }: { trigger: ReactElement; busy: boolean; onRun: (action: string) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const run = (a: string) => {
    setOpen(false);
    setCustom('');
    onRun(a);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          aria-label="Assistente de IA"
          onCloseAutoFocus={keepFocusIfPlaced}
          className="anim-pop-in z-[80] w-64 rounded border border-line bg-surface p-1 shadow-pop"
        >
          {AI_ACTIONS.map((a) => (
            <button
              key={a}
              type="button"
              disabled={busy}
              onClick={() => run(a)}
              className="flex h-8 w-full items-center rounded-xs px-2 text-left text-sm text-fg outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus disabled:opacity-50"
            >
              {a}
            </button>
          ))}
          <form
            className="mt-1 flex items-center gap-1 border-t border-line p-1 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) run(custom.trim());
            }}
          >
            <input
              aria-label="Escreva uma solicitação personalizada…"
              placeholder="Escreva uma solicitação personalizada…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded border border-line-strong bg-surface px-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-action focus:shadow-focus"
            />
            <button
              type="submit"
              aria-label="Enviar solicitação"
              disabled={!custom.trim() || busy}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-action outline-none hover:bg-hover focus-visible:shadow-focus disabled:opacity-50"
            >
              <Send aria-hidden className="h-4 w-4" />
            </button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
