import { localHint } from '@/api/capabilities';
import { useState } from 'react';
import { Button, Checkbox, ConfirmModal, StatusBadge } from '@/components/ui';
import { DEFAULT_STATUSES } from '@/lib/status';
import { absoluteTime } from '@/lib/time';
import { useTickets } from '@/store/useTickets';
import { useFormEntry } from '../formStore';
import { PanelShell } from './PanelShell';
import { useMergeSuggestions } from './panelState';

export function MergePanel({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey);
  const suggestions = useMergeSuggestions(ticketKey);
  const storeStatuses = useTickets((s) => s.statuses);
  const statuses = storeStatuses.length ? storeStatuses : DEFAULT_STATUSES;
  const [checked, setChecked] = useState<number[]>([]);
  const [confirm, setConfirm] = useState(false);
  const targetId = entry?.ticketId ?? null;
  const selected = checked.filter((id) => suggestions.some((t) => t.id === id));

  return (
    <PanelShell title="Sugestões de fusão">
      <div className="flex flex-col gap-6 p-4">
        <section aria-label={`Sugestões de fusão (${suggestions.length})`} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-fg">Sugestões de fusão ({suggestions.length})</h3>
          {suggestions.length === 0 ? (
            <p className="text-sm text-fg-muted">Nenhuma sugestão disponível</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {suggestions.map((t) => {
                const st = statuses.find((s) => s.id === t.statusId);
                return (
                  <li key={t.id} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-hover">
                    <Checkbox
                      aria-label={`Selecionar ticket #${t.id}`}
                      checked={selected.includes(t.id)}
                      onCheckedChange={(on) => setChecked((c) => (on ? [...c, t.id] : c.filter((x) => x !== t.id)))}
                    />
                    <StatusBadge status={st} compact />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-fg">{t.subject}</span>
                      <span className="text-xs text-fg-muted">{absoluteTime(t.createdAt)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {selected.length > 0 ? (
            <Button variant="primary" disabled={targetId === null} className="self-start" onClick={() => setConfirm(true)}>
              Fundir
            </Button>
          ) : null}
        </section>
        <section aria-label="Tickets semelhantes resolvidos" className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-fg">Tickets semelhantes resolvidos</h3>
          <p className="text-sm text-fg-muted">Nenhuma sugestão disponível</p>
        </section>
      </div>
      <ConfirmModal
        open={confirm}
        onOpenChange={setConfirm}
        tone="primary"
        title="Fundir tickets"
        description={`${selected.length === 1 ? 'O ticket selecionado será fundido' : `Os ${selected.length} tickets selecionados serão fundidos`} neste ticket e marcado(s) como resolvido(s).${localHint('merge') ? ' O backend não tem fusão: isto vale somente neste navegador.' : ''}`}
        confirmLabel="Fundir"
        onConfirm={async () => {
          if (targetId === null) return;
          const ok = await useTickets.getState().mergeTickets(targetId, selected);
          if (ok) setChecked([]);
        }}
      />
    </PanelShell>
  );
}
