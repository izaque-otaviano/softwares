import { localHint } from '@/api/capabilities';
import { useState } from 'react';
import { ChevronDown, GitMerge, Trash2, UserCheck, X } from 'lucide-react';
import { Button, ConfirmModal, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui';
import { PRIORITY_LABEL } from '@/lib/status';
import { useTickets } from '@/store/useTickets';
import type { Priority } from '@/types/domain';

export interface BulkBarProps {
  ids: number[];
  onClear: () => void;
}

/** Ações em lote sobre a seleção; usa as ações de `useTickets`. */
export function BulkBar({ ids, onClear }: BulkBarProps) {
  const statuses = useTickets((s) => s.statuses);
  const { assignToMe, setStatus, setPriority, deleteTickets, mergeTickets } = useTickets.getState();
  const [confirm, setConfirm] = useState<'delete' | 'merge' | null>(null);
  const n = ids.length;
  const target = Math.min(...ids);
  const done = (ok: boolean) => {
    if (ok) onClear();
  };

  return (
    <div role="toolbar" aria-label="Ações em lote" className="flex flex-wrap items-center gap-2 border-b border-line bg-action-soft px-4 py-2">
      <span className="text-sm font-semibold text-fg">{n === 1 ? '1 ticket selecionado' : `${n} tickets selecionados`}</span>
      <Button variant="outline" leadingIcon={<UserCheck />} onClick={async () => done(await assignToMe(ids))}>
        Atribuir a mim
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="outline" trailingIcon={<ChevronDown />}>Mudar status</Button>
        </MenuTrigger>
        <MenuContent>
          {statuses.map((s) => (
            <MenuItem key={s.id} onSelect={async () => done(await setStatus(ids, s.id))}>
              {s.agentName}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="outline" trailingIcon={<ChevronDown />}>Mudar prioridade</Button>
        </MenuTrigger>
        <MenuContent>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
            <MenuItem key={p} onSelect={async () => done(await setPriority(ids, p))}>
              {PRIORITY_LABEL[p]}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <Button variant="outline" leadingIcon={<GitMerge />} disabled={n < 2} onClick={() => setConfirm('merge')}>
        Fundir
      </Button>
      <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => setConfirm('delete')}>
        Apagar
      </Button>
      <Button variant="ghost" leadingIcon={<X />} onClick={onClear} className="ml-auto">
        Limpar seleção
      </Button>

      <ConfirmModal
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={n === 1 ? 'Apagar ticket?' : `Apagar ${n} tickets?`}
        description={`Os tickets serão removidos das visualizações. Esta ação não pode ser desfeita.${localHint('deleteTicket') ? ' O backend não apaga tickets: isto vale somente neste navegador.' : ''}`}
        confirmLabel="Apagar"
        onConfirm={async () => {
          done(await deleteTickets(ids));
        }}
      />
      <ConfirmModal
        open={confirm === 'merge'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Fundir ${n} tickets?`}
        description={`Os demais tickets serão fundidos no ticket #${target} e fechados.${localHint('merge') ? ' O backend não tem fusão: isto vale somente neste navegador.' : ''}`}
        confirmLabel="Fundir"
        tone="primary"
        onConfirm={async () => {
          done(await mergeTickets(target, ids.filter((i) => i !== target)));
        }}
      />
    </div>
  );
}
