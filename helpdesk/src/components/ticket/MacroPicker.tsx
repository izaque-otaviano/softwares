import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Eye, Plus, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { macrosApi } from '@/api';
import { goTo } from '@/components/shell/openTab';
import { Button, SkeletonRows } from '@/components/ui';
import { cn } from '@/lib/cn';
import { OPTION_ACTIVE_CMDK } from '@/components/ui/optionStyles';
import type { Macro } from '@/types/domain';
import { useFormStore } from './formStore';
import { MacroPreviewModal } from './MacroPreviewModal';

/** "⚡ Aplicar macro": combobox que abre para cima. Clicar/Enter aplica; olho ou Shift+Enter abre a pré-visualização. */
export function MacroPicker({ ticketKey }: { ticketKey: string }) {
  const [open, setOpen] = useState(false);
  const [macros, setMacros] = useState<Macro[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [highlight, setHighlight] = useState('');
  const [preview, setPreview] = useState<Macro | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setFailed(false);
    macrosApi
      .listMacros()
      .then((list) => alive && setMacros(list.filter((m) => m.active)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open]);

  const apply = (macro: Macro) => {
    useFormStore.getState().applyMacro(ticketKey, macro);
    setOpen(false);
  };
  const highlighted = macros?.find((m) => m.id === highlight);

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button variant="outline" leadingIcon={<Zap aria-hidden className="h-4 w-4" />}>
            Aplicar macro
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={4}
            collisionPadding={8}
            aria-label="Macros"
            className="relative z-[80] w-80 rounded border border-line bg-surface text-sm text-fg shadow-menu data-[state=open]:anim-pop-in data-[state=closed]:anim-fade-out"
          >
            <Command
              label="Macros"
              value={highlight}
              onValueChange={setHighlight}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey && highlighted) {
                  e.preventDefault();
                  e.stopPropagation();
                  setPreview(highlighted);
                  setOpen(false);
                }
              }}
              filter={(value, search, keywords) => {
                const q = search.trim().toLocaleLowerCase('pt-BR');
                return !q || (keywords?.[0] ?? value).toLocaleLowerCase('pt-BR').includes(q) ? 1 : 0;
              }}
            >
              <div className="border-b border-line p-2">
                <Command.Input
                  autoFocus
                  placeholder="Pesquisar macros"
                  aria-label="Pesquisar macros"
                  className="h-8 w-full rounded border border-line-strong bg-surface px-2 text-sm outline-none placeholder:text-fg-muted focus:border-action focus:shadow-focus"
                />
              </div>
              <Command.List aria-label="Lista de macros" className="max-h-64 overflow-y-auto p-1">
                {macros === null && !failed ? (
                  <SkeletonRows rows={3} columns={1} label="Carregando macros" className="p-1" />
                ) : null}
                {failed ? <p className="px-2 py-3 text-sm text-danger">Não foi possível carregar as macros.</p> : null}
                {macros ? <Command.Empty className="px-2 py-3 text-sm text-fg-muted">Nenhuma macro encontrada.</Command.Empty> : null}
                {macros?.map((m) => (
                  <Command.Item
                    key={m.id}
                    value={m.id}
                    keywords={[m.name]}
                    onSelect={() => apply(m)}
                    className={cn('flex min-h-8 cursor-default select-none items-center gap-2 rounded-xs px-2 py-1 outline-none', OPTION_ACTIVE_CMDK)}
                  >
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <button
                      type="button"
                      aria-label={`Pré-visualizar ${m.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview(m);
                        setOpen(false);
                      }}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-muted outline-none transition-colors duration-100 hover:bg-hover hover:text-fg focus-visible:shadow-focus"
                    >
                      <Eye aria-hidden className="h-4 w-4" />
                    </button>
                  </Command.Item>
                ))}
              </Command.List>
              <div className="border-t border-line p-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    goTo('/admin/macros');
                  }}
                  className="flex w-full items-start gap-2 rounded-xs px-2 py-2 text-left outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus"
                >
                  <Plus aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-action" />
                  <span className="flex flex-col">
                    <span className="font-semibold text-action">Criar uma macro</span>
                    <span className="text-xs text-fg-muted">Salve respostas e ações usadas com frequência para resolver tickets mais rapidamente</span>
                  </span>
                </button>
              </div>
            </Command>
            {highlighted ? (
              <div
                role="note"
                data-testid="macro-hover-card"
                className="pointer-events-none absolute bottom-0 left-full ml-2 w-64 rounded border border-line bg-surface p-3 shadow-pop"
              >
                <p className="text-xs font-semibold text-fg">Descrição</p>
                <p className="mt-1 text-sm text-fg-muted">{highlighted.description?.trim() || 'Sem descrição'}</p>
                <p className="mt-3 text-xs text-fg-muted">Shift + Enter para abrir a visualização</p>
              </div>
            ) : null}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <MacroPreviewModal
        macro={preview}
        onOpenChange={(o) => !o && setPreview(null)}
        onApply={(m) => {
          useFormStore.getState().applyMacro(ticketKey, m);
          setPreview(null);
        }}
      />
    </>
  );
}
