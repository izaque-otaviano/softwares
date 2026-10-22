import { useMemo } from 'react';
import { SplitButton, StatusDot, type SplitItem } from '@/components/ui';
import { DEFAULT_STATUSES } from '@/lib/status';
import { useTickets } from '@/store/useTickets';
import { useFormEntry, useFormStore } from './formStore';
import { MacroPicker } from './MacroPicker';
import { StayMenu } from './StayMenu';

/** Barra inferior: macros à esquerda; "Permanecer no ticket" e envio com status à direita. */
export function BottomBar({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey);
  const storeStatuses = useTickets((s) => s.statuses);
  const statuses = storeStatuses.length ? storeStatuses : DEFAULT_STATUSES;
  const isNew = entry?.isNew ?? false;
  const currentId = entry?.values.statusId;

  const items = useMemo<SplitItem[]>(
    () =>
      statuses
        .filter((s) => (isNew || s.category !== 'new') && (s.active !== false || s.id === currentId))
        .map((s) => ({ id: s.id, label: s.agentName, leading: <StatusDot color={s.color} /> })),
    [statuses, isNew, currentId],
  );

  if (!entry) return null;
  const current = statuses.find((s) => s.id === entry.values.statusId);
  const submit = (statusId?: string) => void useFormStore.getState().submit(ticketKey, statusId);

  return (
    <div className="flex h-bottombar shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-4">
      <MacroPicker ticketKey={ticketKey} />
      <div className="flex items-center gap-2">
        <StayMenu ticketKey={ticketKey} />
        <SplitButton
          variant="ink"
          size="lg"
          label={`Enviar como ${current?.agentName ?? 'Novo'}`}
          menuLabel="Escolher status de envio"
          loading={entry.submitting}
          onClick={() => submit()}
          items={items}
          onSelectItem={(item) => submit(item.id)}
        />
      </div>
    </div>
  );
}
