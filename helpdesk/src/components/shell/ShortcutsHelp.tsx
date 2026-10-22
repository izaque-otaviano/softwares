import { Button, Modal } from '@/components/ui';
import { useShortcutsHelp } from './shortcuts';

interface ShortcutRow {
  keys: string[][];
  label: string;
  /** Teclas em sequência ("g" depois "h") em vez de combinação. */
  sequence?: boolean;
}

/** Lista exibida na ajuda. Cada item de `keys` é uma alternativa; dentro dele, as teclas são em sequência ou combinação. */
export const SHORTCUTS: { group: string; rows: ShortcutRow[] }[] = [
  {
    group: 'Navegação',
    rows: [
      { keys: [['g', 'h']], sequence: true, label: 'Ir para Início' },
      { keys: [['g', 'v']], sequence: true, label: 'Ir para Visualizações' },
      { keys: [['/']], label: 'Abrir a busca' },
      { keys: [['?']], label: 'Mostrar esta ajuda' },
    ],
  },
  {
    group: 'Ticket',
    rows: [
      { keys: [['Ctrl', 'Enter'], ['⌘', 'Enter']], label: 'Enviar o ticket' },
      { keys: [['Shift', 'Enter']], label: 'Abrir a visualização da macro destacada' },
    ],
  },
  {
    group: 'Geral',
    rows: [{ keys: [['Esc']], label: 'Fechar menu, popover, painel ou diálogo' }],
  },
];

function Key({ children }: { children: string }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-1 px-1 text-xs font-semibold text-fg">{children}</kbd>;
}

/** Diálogo de ajuda aberto pela tecla "?". */
export function ShortcutsHelpDialog() {
  const open = useShortcutsHelp((s) => s.open);
  const setOpen = useShortcutsHelp((s) => s.setOpen);
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Atalhos de teclado"
      description="Atalhos de uma tecla não funcionam enquanto você digita em um campo."
      size="sm"
      footer={
        <Button variant="outline" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        {SHORTCUTS.map((g) => (
          <section key={g.group} aria-label={g.group}>
            <h3 className="mb-1 text-xs font-semibold text-fg-muted">{g.group}</h3>
            <ul className="divide-y divide-line">
              {g.rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-fg">{r.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {r.keys.map((alt, i) => (
                      <span key={alt.join('+')} className="flex items-center gap-1">
                        {i > 0 ? <span className="px-0.5 text-xs text-fg-muted">ou</span> : null}
                        {alt.map((k, j) => (
                          <span key={k} className="flex items-center gap-1">
                            {j > 0 ? <span className="text-xs text-fg-muted">{r.sequence ? 'depois' : '+'}</span> : null}
                            <Key>{k}</Key>
                          </span>
                        ))}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
