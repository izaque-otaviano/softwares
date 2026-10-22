import { ChevronDown, Lock, MessageSquare, Phone } from 'lucide-react';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui';
import type { ReplyMode } from './formStore';

export const MODE_LABEL: Record<ReplyMode, string> = { public: 'Resposta pública', internal: 'Observação interna', call: 'Chamada' };
const MODE_ICON = { public: MessageSquare, internal: Lock, call: Phone } as const;

export function ReplyModeSwitch({ mode, onChange, allowCall }: { mode: ReplyMode; onChange: (m: ReplyMode) => void; allowCall: boolean }) {
  const Icon = MODE_ICON[mode];
  const modes: ReplyMode[] = allowCall ? ['public', 'internal', 'call'] : ['public', 'internal'];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={`Modo de resposta: ${MODE_LABEL[mode]}`}
          className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-sm font-semibold text-fg outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus data-[state=open]:bg-surface-2"
        >
          <Icon aria-hidden className="h-4 w-4 text-fg-muted" />
          {MODE_LABEL[mode]}
          <ChevronDown aria-hidden className="h-4 w-4 text-fg-muted" />
        </button>
      </MenuTrigger>
      <MenuContent>
        {modes.map((m) => {
          const I = MODE_ICON[m];
          return (
            <MenuItem key={m} icon={<I />} checked={mode === m} onSelect={() => onChange(m)}>
              {MODE_LABEL[m]}
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}
