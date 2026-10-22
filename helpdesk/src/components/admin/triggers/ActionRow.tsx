import { Trash2 } from 'lucide-react';
import { Field, IconButton, Select, Textarea, Input } from '@/components/ui';
import { PRIORITY_LABEL } from '@/lib/status';
import type { Priority, TriggerAction } from '@/types/domain';
import { ACTION_KIND_LABEL, PLACEHOLDERS, RECIPIENT_OPTIONS, blankAction, type ActionKind, type Lookups } from './triggerMeta';

export interface ActionRowProps {
  index: number;
  action: TriggerAction;
  lookups: Lookups;
  onChange: (next: TriggerAction) => void;
  onRemove: () => void;
}

/** Uma ação do gatilho: Categoria da ação + campos específicos. */
export function ActionRow({ index, action, lookups, onChange, onRemove }: ActionRowProps) {
  const n = index + 1;
  return (
    <li className="rounded border border-line bg-surface-1 p-4">
      <div className="flex items-end gap-2">
        <Field label="Categoria" className="w-80">
          <Select
            aria-label={`Categoria da ação ${n}`}
            value={action.kind}
            onValueChange={(v) => onChange(blankAction(v as ActionKind, lookups))}
            options={(Object.keys(ACTION_KIND_LABEL) as ActionKind[]).map((k) => ({ value: k, label: ACTION_KIND_LABEL[k] }))}
          />
        </Field>
        <IconButton label={`Remover ação ${n}`} icon={<Trash2 />} onClick={onRemove} className="ml-auto" />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {action.kind === 'notify_email' ? (
          <>
            <Field label="Destinatário" className="w-80">
              <Select value={action.to} onValueChange={(v) => onChange({ ...action, to: v as typeof action.to })} options={RECIPIENT_OPTIONS} />
            </Field>
            <Field label="Assunto do e-mail">
              <Input value={action.subject} onChange={(e) => onChange({ ...action, subject: e.target.value })} />
            </Field>
            <Field label="Corpo do e-mail" hint={`Variáveis disponíveis: ${PLACEHOLDERS.join(', ')}`}>
              <Textarea minRows={5} value={action.body} onChange={(e) => onChange({ ...action, body: e.target.value })} />
            </Field>
          </>
        ) : null}
        {action.kind === 'set_status' ? (
          <Field label="Status" className="w-80">
            <Select value={action.statusId} onValueChange={(v) => onChange({ ...action, statusId: v })} options={lookups.statuses.map((s) => ({ value: s.id, label: s.agentName }))} />
          </Field>
        ) : null}
        {action.kind === 'set_priority' ? (
          <Field label="Prioridade" className="w-80">
            <Select value={action.priority} onValueChange={(v) => onChange({ ...action, priority: v as Priority })} options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
          </Field>
        ) : null}
        {action.kind === 'add_tags' ? (
          <Field label="Tags" hint="Separe as tags por vírgula.">
            <Input
              defaultValue={action.tags.join(', ')}
              onChange={(e) => onChange({ ...action, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
            />
          </Field>
        ) : null}
        {action.kind === 'assign_group' ? (
          <Field label="Grupo" className="w-80">
            <Select value={action.groupId} onValueChange={(v) => onChange({ ...action, groupId: v })} options={lookups.groups.map((g) => ({ value: g.id, label: g.name }))} />
          </Field>
        ) : null}
      </div>
    </li>
  );
}
