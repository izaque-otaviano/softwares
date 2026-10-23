import { useState } from 'react';
import { fieldsApi } from '@/api';
import { OptionsEditor } from '@/components/admin/OptionsEditor';
import { Banner, Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { ApiError } from '@/api/errors';
import { CREATABLE_FIELD_TYPES, FIELD_TYPE_LABEL, TITLE_MAX, optionsError } from '@/lib/customFields';
import { toast } from '@/store/useUi';
import type { FieldOption, FieldType, TicketField } from '@/types/domain';

export { FIELD_TYPE_LABEL };

export interface FieldModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Campo em edição; `undefined` = novo campo. */
  field?: TicketField;
  onSaved: () => void;
}

/** Erros 400 do servidor por campo do formulário (`title`, `type`, `options`...); o que não tem campo vira faixa. */
type ServerErrors = Partial<Record<'title' | 'type' | 'options' | 'description' | 'is_required', string>>;
const KNOWN = ['title', 'type', 'options', 'description', 'is_required'] as const;

function splitServerErrors(e: unknown): { fields: ServerErrors; banner: string | null } {
  if (!(e instanceof ApiError)) return { fields: {}, banner: 'Não foi possível salvar o campo.' };
  const fields: ServerErrors = {};
  const rest: string[] = [];
  for (const [k, list] of Object.entries(e.fieldErrors ?? {})) {
    if ((KNOWN as readonly string[]).includes(k)) fields[k as keyof ServerErrors] = list[0];
    else rest.push(list[0] ?? '');
  }
  if (Object.keys(fields).length > 0 && rest.length === 0) return { fields, banner: null };
  return { fields, banner: rest[0] ?? e.message };
}

function FieldForm({ field, onOpenChange, onSaved }: Omit<FieldModalProps, 'open'>) {
  const [title, setTitle] = useState(field?.title ?? '');
  const [type, setType] = useState<FieldType>((field?.type as FieldType | undefined) ?? 'text');
  const [description, setDescription] = useState(field?.description ?? '');
  const [options, setOptions] = useState<FieldOption[]>(field?.options ?? []);
  const [required, setRequired] = useState(field?.required ?? false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [server, setServer] = useState<ServerErrors>({});
  const [banner, setBanner] = useState<string | null>(null);

  const used = (field?.valuesCount ?? 0) > 0;
  const titleError = !title.trim() ? 'Informe o título.' : title.trim().length > TITLE_MAX ? `Use no máximo ${TITLE_MAX} caracteres.` : undefined;
  const optError = type === 'dropdown' ? (optionsError(options) ?? undefined) : undefined;

  const submit = async () => {
    setTouched(true);
    if (titleError || optError) return;
    setSaving(true);
    setBanner(null);
    setServer({});
    try {
      const common = { title: title.trim(), description: description.trim(), required, ...(type === 'dropdown' ? { options: options.filter((o) => o.label.trim()).map((o) => ({ value: (o.value || o.label).trim(), label: o.label.trim() })) } : {}) };
      if (field) await fieldsApi.updateField(field.id, { ...common, ...(type !== field.type ? { type } : {}) });
      else await fieldsApi.createField({ ...common, type });
      toast.success(field ? 'Campo atualizado.' : 'Campo criado.');
      onOpenChange(false);
      onSaved();
    } catch (e) {
      // 400 no campo certo; 403 ("Você não tem permissão para esta ação.") e o resto em faixa. O digitado fica.
      const parts = splitServerErrors(e);
      setServer(parts.fields);
      setBanner(parts.banner ? `${parts.banner} O que você digitou foi mantido.` : null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      title={field ? 'Editar campo' : 'Adicionar campo'}
      description="Campos personalizados são só da equipe: o cliente nunca os vê."
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
        {banner ? (
          <Banner tone="error" onRetry={() => void submit()}>
            {banner}
          </Banner>
        ) : null}
        <Field label="Título" required error={(touched ? titleError : undefined) ?? server.title} hint="Aparece no painel do ticket. O identificador do campo nasce do título e não muda depois.">
          <Input value={title} maxLength={TITLE_MAX + 20} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label="Tipo"
          error={server.type}
          hint={field && used ? `${field.valuesCount} ${field.valuesCount === 1 ? 'ticket tem' : 'tickets têm'} valor neste campo: o tipo não pode mais mudar. Crie outro campo e desative este.` : field ? 'O tipo só pode mudar enquanto nenhum ticket tiver valor.' : undefined}
        >
          <Select value={type} onValueChange={(v) => setType(v as FieldType)} disabled={used} options={CREATABLE_FIELD_TYPES.map((t) => ({ value: t, label: FIELD_TYPE_LABEL[t] }))} />
        </Field>
        {type === 'dropdown' ? (
          <Field label="Opções" required error={(touched ? optError : undefined) ?? server.options} hint="A ordem daqui é a ordem na lista. Opções que já estão em uso continuam gravadas nos tickets se você as retirar.">
            <OptionsEditor value={options} onChange={setOptions} />
          </Field>
        ) : null}
        <Field label="Descrição" error={server.description}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} minRows={2} />
        </Field>
        <div>
          <Checkbox checked={required} onCheckedChange={setRequired} label="Obrigatório" />
          <p className="mt-1 text-xs text-fg-muted">
            Exigido ao criar o ticket e ao resolver ou fechar, nos formulários que incluem este campo. Cada formulário também pode marcar o campo como obrigatório.
          </p>
          {server.is_required ? (
            <p role="alert" className="mt-1 text-xs text-danger">
              {server.is_required}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/** Adicionar/editar campo. O formulário é montado só quando aberto, então o estado reinicia a cada uso. */
export function FieldModal({ open, ...rest }: FieldModalProps) {
  return open ? <FieldForm {...rest} /> : null;
}
