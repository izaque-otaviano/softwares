import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select, StatusDot, Textarea } from '@/components/ui';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/status';
import { toast } from '@/store/useUi';
import { useTickets } from '@/store/useTickets';
import type { StatusCategory, TicketStatus } from '@/types/domain';
import { DEFAULT_COLOR_BY_CATEGORY, STATUS_COLOR_OPTIONS } from './statusRules';

export interface StatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criar. */
  status: TicketStatus | null;
}

interface Draft {
  category: StatusCategory;
  agentName: string;
  endUserName: string;
  agentDescription: string;
  color: string;
}

const blank: Draft = { category: 'open', agentName: '', endUserName: '', agentDescription: '', color: DEFAULT_COLOR_BY_CATEGORY.open };

export function StatusModal({ open, onOpenChange, status }: StatusModalProps) {
  const [draft, setDraft] = useState<Draft>(blank);
  const [errors, setErrors] = useState<{ agentName?: string; endUserName?: string }>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setApiError(null);
    setDraft(status ? { category: status.category, agentName: status.agentName, endUserName: status.endUserName, agentDescription: status.agentDescription, color: status.color } : blank);
  }, [open, status]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const next: typeof errors = {};
    if (!draft.agentName.trim()) next.agentName = 'Informe o nome para o agente.';
    if (!draft.endUserName.trim()) next.endUserName = 'Informe o nome para o usuário final.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setApiError(null);
    try {
      await useTickets.getState().saveStatus({
        ...(status ?? {}),
        id: status?.id,
        category: draft.category,
        agentName: draft.agentName.trim(),
        endUserName: draft.endUserName.trim(),
        agentDescription: draft.agentDescription.trim(),
        color: draft.color,
      });
      toast.success(status ? 'Status do ticket atualizado' : 'Status do ticket criado');
      onOpenChange(false);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={status ? 'Editar status do ticket' : 'Criar status do ticket'}
      description="O status aparece para os agentes assim que for salvo."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {status ? 'Salvar' : 'Criar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {apiError ? (
          <p role="alert" className="text-sm text-danger">
            {apiError}
          </p>
        ) : null}
        <Field label="Categoria do status" required>
          <Select
            value={draft.category}
            onValueChange={(v) => {
              const category = v as StatusCategory;
              setDraft((d) => ({ ...d, category, color: d.color === DEFAULT_COLOR_BY_CATEGORY[d.category] ? DEFAULT_COLOR_BY_CATEGORY[category] : d.color }));
            }}
            options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
          />
        </Field>
        <Field label="Nome do status para o agente" required error={errors.agentName}>
          <Input value={draft.agentName} onChange={(e) => set('agentName', e.target.value)} maxLength={60} />
        </Field>
        <Field label="Nome do status para o usuário final" required error={errors.endUserName}>
          <Input value={draft.endUserName} onChange={(e) => set('endUserName', e.target.value)} maxLength={60} />
        </Field>
        <Field label="Descrição para o agente">
          <Textarea value={draft.agentDescription} onChange={(e) => set('agentDescription', e.target.value)} rows={3} />
        </Field>
        <Field label="Cor">
          <Select
            value={draft.color}
            onValueChange={(v) => set('color', v)}
            options={STATUS_COLOR_OPTIONS.map((o) => ({ value: o.value, label: o.label, icon: <StatusDot color={o.value} /> }))}
          />
        </Field>
      </div>
    </Modal>
  );
}
