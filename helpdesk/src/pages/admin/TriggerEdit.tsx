import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { triggersApi, metaApi } from '@/api';
import { EditFooter, PageHeader } from '@/components/admin/PageHeader';
import { DropdownButton } from '@/components/admin/lists/DropdownButton';
import { useAsync } from '@/components/admin/lists/useAsync';
import { ActionRow } from '@/components/admin/triggers/ActionRow';
import { ConditionBlock } from '@/components/admin/triggers/ConditionBlock';
import { DEFAULT_CATEGORIES, blankAction, blankTrigger, type Lookups } from '@/components/admin/triggers/triggerMeta';
import { Badge, Banner, Button, ConfirmModal, Field, Input, Select, SkeletonText, Textarea } from '@/components/ui';
import { relativeTime } from '@/lib/time';
import { useTickets } from '@/store/useTickets';
import { toast } from '@/store/useUi';
import type { Group, Trigger } from '@/types/domain';

const NEW_CATEGORY = '__new__';
type Draft = Omit<Trigger, 'id' | 'fired7d'> & { id?: string; fired7d?: number };

export default function TriggerEdit() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const storeStatuses = useTickets((s) => s.statuses);

  const state = useAsync(async () => {
    const [groups, all, trigger] = await Promise.all([
      metaApi.listGroups(),
      triggersApi.listTriggers(),
      isNew ? Promise.resolve(null) : triggersApi.getTrigger(id!),
      useTickets.getState().loadStatuses(),
    ]).then(([g, a, t]) => [g, a, t] as [Group[], Trigger[], Trigger | null]);
    return { groups, categories: [...new Set([...DEFAULT_CATEGORIES, ...all.map((t) => t.category)])], trigger };
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; category?: string; conditions?: string; actions?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const lookups: Lookups = useMemo(() => ({ statuses: storeStatuses, groups: state.data?.groups ?? [] }), [storeStatuses, state.data]);

  useEffect(() => {
    if (!state.data) return;
    if (state.data.trigger) {
      const t = state.data.trigger;
      setDraft({ ...t, all: t.all.map((c) => ({ ...c })), any: t.any.map((c) => ({ ...c })), actions: t.actions.map((a) => ({ ...a })) });
    } else {
      const base = blankTrigger();
      if (params.get('modelo') === 'notificar') {
        base.name = 'Notificar solicitante';
        base.actions = [blankAction('notify_email', { statuses: useTickets.getState().statuses, groups: state.data.groups })];
        base.all = [{ field: 'comment.is_public', operator: 'is', value: 'true' }];
      }
      setDraft(base);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    if (!draft) return;
    const category = newCategory !== null ? newCategory.trim() : draft.category;
    const next: typeof errors = {};
    if (!draft.name.trim()) next.name = 'Informe o nome do gatilho.';
    if (!category) next.category = 'Informe a categoria do gatilho.';
    if (draft.all.length + draft.any.length === 0) next.conditions = 'Adicione ao menos uma condição; um gatilho sem condições nunca dispara.';
    if (draft.actions.length === 0) next.actions = 'Adicione ao menos uma ação.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await triggersApi.saveTrigger({ ...draft, name: draft.name.trim(), description: draft.description.trim(), category });
      toast.success(isNew ? 'Gatilho criado' : 'Gatilho atualizado');
      navigate('/admin/triggers');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Não foi possível salvar o gatilho. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!draft?.id) return;
    try {
      const t = await triggersApi.setTriggerActive(draft.id, !draft.active);
      set({ active: t.active, updatedAt: t.updatedAt });
      toast.success(t.active ? 'Gatilho ativado' : 'Gatilho desativado');
    } catch {
      toast.error('Não foi possível alterar o gatilho. Tente novamente.');
    }
  };

  const clone = async () => {
    if (!draft) return;
    try {
      const { id: _id, fired7d: _f, ...rest } = draft;
      const copy = await triggersApi.saveTrigger({ ...rest, name: `${draft.name} (cópia)`, active: false });
      toast.success('Gatilho clonado (desativado)');
      navigate(`/admin/triggers/${copy.id}`);
    } catch {
      toast.error('Não foi possível clonar o gatilho.');
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    await triggersApi.deleteTrigger(draft.id);
    toast.success('Gatilho excluído');
    navigate('/admin/triggers');
  };

  const breadcrumb = [{ label: 'Objetos e regras' }, { label: 'Gatilhos', to: '/admin/triggers' }, { label: isNew ? 'Novo gatilho' : (draft?.name || 'Gatilho') }];

  if (state.error) {
    return (
      <div className="flex min-h-full flex-col bg-surface">
        <PageHeader breadcrumb={breadcrumb} title="Gatilho" />
        <div className="p-6">
          <Banner tone="error" onRetry={state.reload}>
            {state.error}
          </Banner>
        </div>
      </div>
    );
  }

  if (state.loading || !draft || !state.data) {
    return (
      <div className="flex min-h-full flex-col bg-surface" aria-busy="true">
        <PageHeader breadcrumb={breadcrumb} title="Gatilho" />
        <div className="p-6">
          <SkeletonText lines={6} label="Carregando gatilho" />
        </div>
      </div>
    );
  }

  const categories = state.data.categories;
  const categoryValue = newCategory !== null ? NEW_CATEGORY : draft.category;

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader
        breadcrumb={breadcrumb}
        title={isNew ? 'Novo gatilho' : draft.name}
        titleAside={
          <>
            <Badge tone={draft.active ? 'success' : 'neutral'}>{draft.active ? 'Ativo' : 'Inativo'}</Badge>
            {draft.updatedAt ? <span className="text-xs text-fg-muted">Última atualização {relativeTime(draft.updatedAt)}</span> : null}
          </>
        }
        actions={
          <DropdownButton
            label="Ações"
            disabled={isNew}
            items={[
              { id: 'toggle', label: draft.active ? 'Desativar' : 'Ativar', onSelect: () => void toggleActive() },
              { id: 'clone', label: 'Clonar', onSelect: () => void clone() },
              { id: 'delete', label: 'Excluir', tone: 'danger', onSelect: () => setConfirmDelete(true) },
            ]}
          />
        }
      />
      <div className="flex max-w-4xl flex-1 flex-col gap-6 px-6 py-6">
        {saveError ? (
          <Banner tone="error" onRetry={() => void save()}>
            {saveError}
          </Banner>
        ) : null}
        <section aria-label="Informações gerais" className="flex flex-col gap-4">
          <Field label="Nome do gatilho" required error={errors.name}>
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Descrição">
            <Textarea minRows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Categoria do gatilho" required error={errors.category}>
            <Select
              className="w-80"
              value={categoryValue}
              onValueChange={(v) => {
                if (v === NEW_CATEGORY) setNewCategory('');
                else {
                  setNewCategory(null);
                  set({ category: v });
                }
              }}
              options={[...categories.map((c) => ({ value: c, label: c })), { value: NEW_CATEGORY, label: 'Criar nova categoria…' }]}
            />
          </Field>
          {newCategory !== null ? (
            <Field label="Nome da nova categoria" required>
              <Input className="w-80" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
            </Field>
          ) : null}
        </section>

        <section aria-labelledby="trg-conditions" className="flex flex-col gap-3">
          <h2 id="trg-conditions" className="text-md font-semibold text-fg">
            Condições
          </h2>
          <p className="text-sm text-fg-muted">O gatilho dispara quando o ticket atende às condições abaixo.</p>
          {errors.conditions ? (
            <p role="alert" className="text-xs text-danger">
              {errors.conditions}
            </p>
          ) : null}
          <ConditionBlock title="Atende TODAS as condições a seguir" scope="todas" conditions={draft.all} onChange={(all) => set({ all })} lookups={lookups} />
          <ConditionBlock title="Atende QUALQUER condição a seguir" scope="qualquer" conditions={draft.any} onChange={(any) => set({ any })} lookups={lookups} hint="Opcional. Se vazio, vale só o bloco acima." />
        </section>

        <section aria-labelledby="trg-actions" className="flex flex-col gap-3">
          <h2 id="trg-actions" className="text-md font-semibold text-fg">
            Ações
          </h2>
          {errors.actions ? (
            <p role="alert" className="text-xs text-danger">
              {errors.actions}
            </p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {draft.actions.map((a, i) => (
              <ActionRow
                key={i}
                index={i}
                action={a}
                lookups={lookups}
                onChange={(next) => set({ actions: draft.actions.map((x, idx) => (idx === i ? next : x)) })}
                onRemove={() => set({ actions: draft.actions.filter((_, idx) => idx !== i) })}
              />
            ))}
          </ul>
          <div>
            <Button variant="outline" leadingIcon={<Plus />} onClick={() => set({ actions: [...draft.actions, blankAction('notify_email', lookups)] })}>
              Adicionar ação
            </Button>
          </div>
        </section>
      </div>
      <EditFooter onCancel={() => navigate('/admin/triggers')} onSave={() => void save()} saving={saving} />
      <ConfirmModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir gatilho"
        description={`Excluir "${draft.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={remove}
      />
    </div>
  );
}
