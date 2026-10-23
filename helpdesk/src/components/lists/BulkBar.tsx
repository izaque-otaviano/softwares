import { localHint } from '@/api/capabilities';
import { useState } from 'react';
import { ChevronDown, GitMerge, Trash2, UserCheck, X } from 'lucide-react';
import { Button, ConfirmModal, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui';
import { SETTINGS_MANAGE, useCan } from '@/lib/permissions';
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
  const { assignToMe, requestSetStatus, setPriority, deleteTickets, mergeTickets } = useTickets.getState();
  const [confirm, setConfirm] = useState<'delete' | 'merge' | null>(null);
  const canDelete = useCan(SETTINGS_MANAGE);
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
            <MenuItem key={s.id} onSelect={() => void requestSetStatus(ids, s.id, onClear)}>
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
      {canDelete ? (
        <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => setConfirm('delete')}>
          Apagar
        </Button>
      ) : null}
      <Button variant="ghost" leadingIcon={<X />} onClick={onClear} className="ml-auto">
        Limpar seleção
      </Button>

      <ConfirmModal
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={n === 1 ? 'Apagar ticket?' : `Apagar ${n} tickets?`}
        description={`${n === 1 ? 'O ticket sai' : 'Os tickets saem'} de todas as listas, da busca e dos relatórios para todos. As mensagens e o histórico são guardados e só um administrador pode restaurar em até 30 dias. Ticket com horas de manutenção lançadas não pode ser apagado e será mantido.`}
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
