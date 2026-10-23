import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fieldsApi, formsApi } from '@/api';
import { ApiError } from '@/api/errors';
import { useAsync } from '@/components/admin/useAsync';
import { useGroups } from '@/components/ticket/useTicketLookups';
import { Banner, Button, Checkbox, Field, IconButton, Input, Modal, Select, Textarea } from '@/components/ui';
import { FIELD_TYPE_LABEL } from '@/lib/customFields';
import { TYPE_LABEL } from '@/lib/status';
import { toast } from '@/store/useUi';
import type { FormFieldItem, TicketForm, TicketType } from '@/types/domain';

export interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Formulário em edição; `undefined` = novo. */
  form?: TicketForm;
  onSaved: () => void;
}

const NONE = '';
const TYPES = Object.keys(TYPE_LABEL) as TicketType[];
const KNOWN = ['name', 'description', 'default_team', 'type', 'form_fields', 'is_default', 'is_active'] as const;
type ServerErrors = Partial<Record<(typeof KNOWN)[number], string>>;

function splitServerErrors(e: unknown): { fields: ServerErrors; banner: string | null } {
  if (!(e instanceof ApiError)) return { fields: {}, banner: 'Não foi possível salvar o formulário.' };
  const fields: ServerErrors = {};
  const rest: string[] = [];
  for (const [k, list] of Object.entries(e.fieldErrors ?? {})) {
    if ((KNOWN as readonly string[]).includes(k)) fields[k as keyof ServerErrors] = list.join(' ');
    else rest.push(list[0] ?? '');
  }
  if (Object.keys(fields).length > 0 && rest.length === 0) return { fields, banner: null };
  return { fields, banner: rest[0] ?? e.message };
}

function FormForm({ form, onOpenChange, onSaved }: Omit<FormModalProps, 'open'>) {
  const groups = useGroups();
  const { data: allFields } = useAsync(() => fieldsApi.listFields());
  const [name, setName] = useState(form?.name ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [active, setActive] = useState(form?.active ?? true);
  const [isDefault, setIsDefault] = useState(form?.isDefault ?? false);
  const [team, setTeam] = useState(form?.defaultTeamId ?? NONE);
  const [type, setType] = useState<TicketType | typeof NONE>(form?.defaultType ?? NONE);
  const [items, setItems] = useState<FormFieldItem[]>(form?.fields ?? []);
  const [pick, setPick] = useState(NONE);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [server, setServer] = useState<ServerErrors>({});
  const [banner, setBanner] = useState<string | null>(null);

  const nameError = !name.trim() ? 'Informe o nome.' : name.trim().length > 80 ? 'Use no máximo 80 caracteres.' : undefined;
  const available = useMemo(() => (allFields ?? []).filter((f) => f.active && !items.some((i) => i.slug === (f.slug ?? f.id))), [allFields, items]);

  const move = (i: number, to: number) =>
    setItems((list) => {
      const next = [...list];
      const [it] = next.splice(i, 1);
      next.splice(to, 0, it!);
      return next;
    });

  const addField = (slug: string) => {
    const f = (allFields ?? []).find((x) => (x.slug ?? x.id) === slug);
    const t = f?.type;
    if (!f || !t || t === 'system') return;
    setItems((list) => [...list, { fieldId: f.id, slug: f.slug ?? f.id, title: f.title, type: t, fieldActive: f.active, required: false }]);
    setPick(NONE);
  };

  const submit = async () => {
    setTouched(true);
    if (nameError) return;
    setSaving(true);
    setBanner(null);
    setServer({});
    const body = {
      name: name.trim(),
      description: description.trim(),
      active,
      isDefault,
      defaultTeamId: team || null,
      defaultType: (type || null) as TicketType | null,
      fields: items.map((i) => ({ field: i.slug, required: i.required })),
    };
    try {
      if (form) await formsApi.updateForm(form.id, body);
      else await formsApi.createForm(body);
      toast.success(form ? 'Formulário atualizado.' : 'Formulário criado.');
      onOpenChange(false);
      onSaved();
    } catch (e) {
      const parts = splitServerErrors(e);
      setServer(parts.fields);
      setBanner(parts.banner ? `${parts.banner} O que você digitou foi mantido.` : null);
    } finally {
      setSaving(false);
    }
  };

  const wasDefault = form?.isDefault ?? false;
  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      size="lg"
      title={form ? 'Editar formulário' : 'Adicionar formulário'}
      description="O formulário define quais campos aparecem no ticket, a ordem e o que é obrigatório. Só a equipe os vê."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {form ? 'Salvar' : 'Adicionar formulário'}
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
        <Field label="Nome" required error={(touched ? nameError : undefined) ?? server.name}>
          <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Descrição" error={server.description}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} minRows={2} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Equipe padrão" error={server.default_team} hint="Vale para tickets novos criados com este formulário.">
            <Select value={team} onValueChange={setTeam} options={[{ value: NONE, label: 'Nenhuma' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
          </Field>
          <Field label="Tipo padrão" error={server.type}>
            <Select value={type} onValueChange={(v) => setType(v as TicketType | typeof NONE)} options={[{ value: NONE, label: 'Nenhum' }, ...TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />
          </Field>
        </div>
        <div className="flex flex-col gap-1">
          <Checkbox checked={active} onCheckedChange={setActive} label="Ativo" disabled={wasDefault} />
          <Checkbox checked={isDefault} onCheckedChange={setIsDefault} label="Formulário padrão" disabled={wasDefault} />
          <p className="text-xs text-fg-muted">
            {wasDefault ? 'Este é o formulário padrão. Para trocar, defina outro formulário como padrão.' : 'O formulário padrão vale para tickets sem formulário próprio. Só existe um: marcar este troca o padrão.'}
          </p>
          {server.is_default || server.is_active ? (
            <p role="alert" className="text-xs text-danger">
              {server.is_default ?? server.is_active}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold text-fg">Campos do formulário</div>
          <p className="text-xs text-fg-muted">A ordem daqui é a ordem no ticket. Obrigatório vale neste formulário (o campo também pode ser obrigatório em todos).</p>
          <div role="group" aria-label="Campos do formulário" className="flex flex-col gap-2">
            {items.length === 0 ? <p className="rounded bg-surface-1 px-3 py-2 text-sm text-fg-muted">Nenhum campo. Adicione abaixo.</p> : null}
            <ol className="flex flex-col gap-1">
              {items.map((it, i) => (
                <li key={it.slug} className="flex items-center gap-2 rounded border border-line bg-surface px-2 py-1">
                  <span aria-hidden="true" className="w-5 shrink-0 text-right text-xs text-fg-muted tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{it.title}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {FIELD_TYPE_LABEL[it.type]}
                      {!it.fieldActive ? ' · campo desativado' : ''}
                    </span>
                  </span>
                  <Checkbox checked={it.required} aria-label={`${it.title}: obrigatório`} label="Obrigatório" onCheckedChange={(c) => setItems((l) => l.map((x, j) => (j === i ? { ...x, required: c } : x)))} />
                  <IconButton label={`Subir ${it.title}`} icon={<ArrowUp />} variant="ghost" disabled={i === 0} onClick={() => move(i, i - 1)} />
                  <IconButton label={`Descer ${it.title}`} icon={<ArrowDown />} variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} />
                  <IconButton label={`Remover ${it.title}`} icon={<X />} variant="ghost" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ol>
            <Select
              aria-label="Adicionar campo ao formulário"
              value={pick}
              placeholder={available.length ? 'Adicionar campo…' : 'Todos os campos ativos já estão no formulário'}
              disabled={available.length === 0}
              options={available.map((f) => ({ value: f.slug ?? f.id, label: `${f.title} (${FIELD_TYPE_LABEL[f.type]})` }))}
              onValueChange={addField}
            />
          </div>
          {server.form_fields ? (
            <p role="alert" className="text-xs text-danger">
              {server.form_fields}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/** Adicionar/editar formulário. Montado só quando aberto: o estado reinicia a cada uso. */
export function FormModal({ open, ...rest }: FormModalProps) {
  return open ? <FormForm {...rest} /> : null;
}
