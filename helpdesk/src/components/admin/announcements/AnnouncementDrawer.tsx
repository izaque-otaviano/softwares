import { useState } from 'react';
import { Banner, Button, Checkbox, Drawer, Field, Input, Select, Switch, Textarea } from '@/components/ui';
import { saveErrorMessage, serverFieldError } from '@/components/admin/sla/adminAForm';
import { fromLocalInput, toLocalInput } from '@/lib/datetimeLocal';
import type { Announcement, AnnouncementInput, AnnouncementKind, AudienceKind, RefOption } from '@/types/admin-a';
import { AUDIENCE_LABEL, KIND_LABEL, ROLE_OPTIONS } from './announcementText';

export interface AudienceRefs {
  teams: RefOption[];
  companies: RefOption[];
  plans: RefOption[];
}

interface Errors {
  title?: string;
  body?: string;
  startsAt?: string;
  endsAt?: string;
  target?: string;
}

const nowLocal = () => toLocalInput(new Date().toISOString());

export function validateAnnouncement(v: AnnouncementInput, startsLocal: string, endsLocal: string): Errors {
  const e: Errors = {};
  if (!v.title.trim()) e.title = 'Informe o título.';
  else if (v.title.trim().length > 150) e.title = 'Use no máximo 150 caracteres.';
  if (!v.body.trim()) e.body = 'Escreva a mensagem do aviso.';
  if (!startsLocal || !fromLocalInput(startsLocal)) e.startsAt = 'Informe o início da vigência.';
  if (endsLocal) {
    if (!fromLocalInput(endsLocal)) e.endsAt = 'Data de fim inválida.';
    else if (startsLocal && fromLocalInput(startsLocal) && new Date(fromLocalInput(endsLocal)) <= new Date(fromLocalInput(startsLocal))) e.endsAt = 'Fim da vigência deve ser depois do início.';
  }
  const need: Partial<Record<AudienceKind, number>> = { teams: v.targetTeamIds.length, roles: v.targetRoles.length, companies: v.targetCompanyIds.length, plans: v.targetPlanIds.length };
  if (v.audience in need && need[v.audience] === 0) e.target = 'Escolha pelo menos um destinatário.';
  return e;
}

export interface AnnouncementDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement: Announcement | null;
  refs: AudienceRefs;
  readOnly: boolean;
  onSave: (input: AnnouncementInput) => Promise<void>;
}

export function AnnouncementDrawer(props: AnnouncementDrawerProps) {
  const { open, onOpenChange, announcement, readOnly } = props;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={announcement ? (readOnly ? 'Aviso' : 'Editar aviso') : 'Novo aviso'} width="w-[480px]" bodyClassName="p-0">
      {open ? <AnnouncementForm {...props} /> : null}
    </Drawer>
  );
}

function CheckList({ legend, options, selected, onChange, disabled, error }: { legend: string; options: RefOption[]; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean; error?: string }) {
  return (
    <fieldset className="rounded border border-line p-3">
      <legend className="px-1 text-xs font-semibold text-fg">{legend}</legend>
      {options.length === 0 ? <p className="text-sm text-fg-muted">Nenhuma opção disponível para o seu usuário.</p> : null}
      <div className="max-h-44 space-y-1 overflow-y-auto">
        {options.map((o) => (
          <Checkbox key={o.id} label={o.name} checked={selected.includes(o.id)} disabled={disabled} onCheckedChange={(c) => onChange(c ? [...selected, o.id] : selected.filter((x) => x !== o.id))} />
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function AnnouncementForm({ onOpenChange, announcement, refs, readOnly, onSave }: AnnouncementDrawerProps) {
  const [v, setV] = useState<AnnouncementInput>(() =>
    announcement
      ? { id: announcement.id, title: announcement.title, body: announcement.body, kind: announcement.kind, startsAt: announcement.startsAt, endsAt: announcement.endsAt, pinned: announcement.pinned, active: announcement.active, audience: announcement.audience, targetRoles: announcement.targetRoles, targetTeamIds: announcement.targetTeamIds, targetCompanyIds: announcement.targetCompanyIds, targetPlanIds: announcement.targetPlanIds }
      : { title: '', body: '', kind: 'info', startsAt: '', endsAt: null, pinned: false, active: true, audience: 'all_internal', targetRoles: [], targetTeamIds: [], targetCompanyIds: [], targetPlanIds: [] },
  );
  const [startsLocal, setStartsLocal] = useState(() => (announcement ? toLocalInput(announcement.startsAt) : nowLocal()));
  const [endsLocal, setEndsLocal] = useState(() => (announcement?.endsAt ? toLocalInput(announcement.endsAt) : ''));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof AnnouncementInput>(k: K, val: AnnouncementInput[K]) => setV((s) => ({ ...s, [k]: val }));

  const submit = async () => {
    const found = validateAnnouncement(v, startsLocal, endsLocal);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await onSave({ ...v, startsAt: fromLocalInput(startsLocal), endsAt: endsLocal ? fromLocalInput(endsLocal) : null });
      onOpenChange(false);
    } catch (e) {
      setServerError(e);
    } finally {
      setSaving(false);
    }
  };

  const keys = ['title', 'body', 'starts_at', 'ends_at'];
  const general = serverError && !keys.some((k) => serverFieldError(serverError, k)) ? saveErrorMessage(serverError) : null;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {general ? (
          <Banner tone="error" title="Não foi possível salvar">
            {general}
          </Banner>
        ) : null}
        <Field label="Título" required error={errors.title ?? serverFieldError(serverError, 'title')}>
          <Input value={v.title} maxLength={150} disabled={readOnly} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Mensagem" required error={errors.body ?? serverFieldError(serverError, 'body')}>
          <Textarea value={v.body} rows={4} disabled={readOnly} onChange={(e) => set('body', e.target.value)} />
        </Field>
        <Field label="Tipo">
          <Select value={v.kind} disabled={readOnly} onValueChange={(k) => set('kind', k as AnnouncementKind)} options={(Object.keys(KIND_LABEL) as AnnouncementKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início da vigência" required error={errors.startsAt ?? serverFieldError(serverError, 'starts_at')}>
            <Input type="datetime-local" value={startsLocal} disabled={readOnly} onChange={(e) => setStartsLocal(e.target.value)} />
          </Field>
          <Field label="Fim da vigência" error={errors.endsAt ?? serverFieldError(serverError, 'ends_at')} hint="Vazio = sem expiração.">
            <Input type="datetime-local" value={endsLocal} disabled={readOnly} onChange={(e) => setEndsLocal(e.target.value)} />
          </Field>
        </div>
        <Field label="Quem vê">
          <Select value={v.audience} disabled={readOnly} onValueChange={(a) => set('audience', a as AudienceKind)} options={(Object.keys(AUDIENCE_LABEL) as AudienceKind[]).map((a) => ({ value: a, label: AUDIENCE_LABEL[a] }))} />
        </Field>
        {v.audience === 'teams' ? <CheckList legend="Equipes" options={refs.teams} selected={v.targetTeamIds} onChange={(x) => set('targetTeamIds', x)} disabled={readOnly} error={errors.target} /> : null}
        {v.audience === 'companies' ? <CheckList legend="Empresas" options={refs.companies} selected={v.targetCompanyIds} onChange={(x) => set('targetCompanyIds', x)} disabled={readOnly} error={errors.target} /> : null}
        {v.audience === 'plans' ? <CheckList legend="Planos" options={refs.plans} selected={v.targetPlanIds} onChange={(x) => set('targetPlanIds', x)} disabled={readOnly} error={errors.target} /> : null}
        {v.audience === 'roles' ? <CheckList legend="Papéis" options={ROLE_OPTIONS.map((r) => ({ id: r.value, name: r.label }))} selected={v.targetRoles} onChange={(x) => set('targetRoles', x)} disabled={readOnly} error={errors.target} /> : null}
        <div className="space-y-2">
          <Switch checked={v.pinned} disabled={readOnly} onCheckedChange={(c) => set('pinned', c)} label="Fixar no topo" />
          <div>
            <Switch checked={v.active} disabled={readOnly} onCheckedChange={(c) => set('active', c)} label="Aviso ativo" />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line px-4 py-3">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {readOnly ? 'Fechar' : 'Cancelar'}
        </Button>
        {readOnly ? null : (
          <Button type="submit" variant="primary" loading={saving}>
            Salvar
          </Button>
        )}
      </div>
    </form>
  );
}
