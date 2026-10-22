import { useState } from 'react';
import { fieldsApi } from '@/api';
import { Button, Field, Input, Modal, Select, TagInput, Textarea } from '@/components/ui';
import { toast } from '@/store/useUi';
import type { TicketField } from '@/types/domain';

export const FIELD_TYPE_LABEL: Record<TicketField['type'], string> = {
  text: 'Texto',
  textarea: 'Área de texto',
  dropdown: 'Lista suspensa',
  number: 'Numérico',
  system: 'Sistema',
};

const CREATABLE: TicketField['type'][] = ['text', 'textarea', 'dropdown', 'number'];

export interface FieldModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Campo em edição; `undefined` = novo campo. */
  field?: TicketField;
  onSaved: () => void;
}

function FieldForm({ field, onOpenChange, onSaved }: Omit<FieldModalProps, 'open'>) {
  const [title, setTitle] = useState(field?.title ?? '');
  const [type, setType] = useState<TicketField['type']>(field?.type ?? 'text');
  const [description, setDescription] = useState(field?.description ?? '');
  const [options, setOptions] = useState<string[]>(field?.options ?? []);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const titleError = !title.trim() ? 'Informe o nome de exibição.' : undefined;
  const optionsError = type === 'dropdown' && options.length === 0 ? 'Adicione ao menos uma opção.' : undefined;

  const submit = async () => {
    setTouched(true);
    if (titleError || optionsError) return;
    setSaving(true);
    try {
      const extra = { description: description.trim() || undefined, options: type === 'dropdown' ? options : undefined };
      if (field) await fieldsApi.updateField(field.id, { title: title.trim(), ...extra });
      else await fieldsApi.createField({ title, type, ...extra });
      toast.success(field ? 'Campo atualizado.' : 'Campo criado.');
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o campo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      title={field ? 'Editar campo' : 'Adicionar campo'}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {field ? 'Salvar' : 'Adicionar campo'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome de exibição" required error={touched ? titleError : undefined}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Tipo" hint={field ? 'O tipo não pode ser alterado depois de criado.' : undefined}>
          <Select
            value={type}
            onValueChange={(v) => setType(v as TicketField['type'])}
            disabled={Boolean(field)}
            options={(field ? [field.type] : CREATABLE).map((t) => ({ value: t, label: FIELD_TYPE_LABEL[t] }))}
          />
        </Field>
        {type === 'dropdown' ? (
          <Field label="Opções" hint="Digite e pressione Enter para adicionar." error={touched ? optionsError : undefined}>
            <TagInput value={options} onChange={setOptions} placeholder="Nova opção" />
          </Field>
        ) : null}
        <Field label="Descrição">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} minRows={2} />
        </Field>
      </div>
    </Modal>
  );
}

/** Adicionar/editar campo. O formulário é montado só quando aberto, então o estado reinicia a cada uso. */
export function FieldModal({ open, ...rest }: FieldModalProps) {
  return open ? <FieldForm {...rest} /> : null;
}
