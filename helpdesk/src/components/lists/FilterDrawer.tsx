import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Combobox, Drawer, Field, Input, Select, TagInput, type ComboOption } from '@/components/ui';
import { PRIORITY_LABEL, TYPE_LABEL } from '@/lib/status';
import type { Priority, TicketStatus, TicketType, User } from '@/types/domain';
import { EMPTY_FILTERS, type DatePreset, type ViewFilters } from './viewQuery';

export interface FilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ViewFilters;
  onApply: (f: ViewFilters) => void;
  statuses: TicketStatus[];
  requesters: User[];
  tagSuggestions: string[];
}

const DATE_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'any', label: 'Qualquer um' },
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'range', label: 'Período' },
];

const TYPE_OPTIONS = [{ value: 'any', label: 'Qualquer um' }, ...(Object.keys(TYPE_LABEL) as TicketType[]).map((k) => ({ value: k, label: TYPE_LABEL[k] }))];
const PRIORITY_OPTIONS = [{ value: 'any', label: 'Qualquer uma' }, ...(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => ({ value: k, label: PRIORITY_LABEL[k] }))];

/** Gaveta direita (380 px) de filtros. Edita um rascunho; só "Aplicar filtros" confirma. */
export function FilterDrawer({ open, onOpenChange, value, onApply, statuses, requesters, tagSuggestions }: FilterDrawerProps) {
  const [draft, setDraft] = useState<ViewFilters>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const patch = (p: Partial<ViewFilters>) => setDraft((d) => ({ ...d, ...p }));
  const requesterOptions = useMemo<ComboOption[]>(
    () => requesters.map((u) => ({ value: u.id, label: u.name, description: u.email })),
    [requesters],
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Filtrar tickets"
      footer={
        <>
          <button type="button" className="rounded px-1 text-sm text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <Button variant="outline" onClick={() => setDraft(EMPTY_FILTERS)}>
            Limpar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Aplicar filtros
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Tags">
          <TagInput value={draft.tags} onChange={(tags) => patch({ tags })} suggestions={tagSuggestions} placeholder="Adicionar tag" />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-semibold text-fg-muted">Status do ticket</legend>
          {statuses.map((s) => (
            <Checkbox
              key={s.id}
              label={s.agentName}
              checked={draft.statusIds.includes(s.id)}
              onCheckedChange={(on) => patch({ statusIds: on ? [...draft.statusIds, s.id] : draft.statusIds.filter((x) => x !== s.id) })}
            />
          ))}
        </fieldset>
        <Field label="Assunto">
          <Input value={draft.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder="Contém o texto" />
        </Field>
        <Field label="Solicitante">
          <Combobox
            value={draft.requesterId}
            onValueChange={(v) => patch({ requesterId: v })}
            options={requesterOptions}
            placeholder="Qualquer solicitante"
            searchPlaceholder="Buscar solicitante"
            clearable
          />
        </Field>
        <Field label="Data da solicitação">
          <Select value={draft.datePreset} onValueChange={(v) => patch({ datePreset: v as DatePreset })} options={DATE_OPTIONS} />
        </Field>
        {draft.datePreset === 'range' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="De">
              <Input type="date" value={draft.from} onChange={(e) => patch({ from: e.target.value })} />
            </Field>
            <Field label="Até">
              <Input type="date" value={draft.to} onChange={(e) => patch({ to: e.target.value })} />
            </Field>
          </div>
        ) : null}
        <Field label="Tipo">
          <Select value={draft.type} onValueChange={(v) => patch({ type: v as ViewFilters['type'] })} options={TYPE_OPTIONS} />
        </Field>
        <Field label="Prioridade">
          <Select value={draft.priority} onValueChange={(v) => patch({ priority: v as ViewFilters['priority'] })} options={PRIORITY_OPTIONS} />
        </Field>
      </div>
    </Drawer>
  );
}
