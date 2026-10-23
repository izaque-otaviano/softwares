import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { macrosApi } from '@/api';
import { IS_REAL } from '@/api/mode';
import { EditFooter, PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/lists/useAsync';
import { AVAILABLE_TO_LABEL, htmlToText, textToHtml } from '@/components/admin/macros/macroText';
import { Banner, Field, Input, Select, SkeletonText, Switch, TagInput, Textarea } from '@/components/ui';
import { MACRO_WRITE, useCan } from '@/lib/permissions';
import { PRIORITY_LABEL } from '@/lib/status';
import { useTickets } from '@/store/useTickets';
import { toast } from '@/store/useUi';
import type { Macro, Priority } from '@/types/domain';

interface Draft {
  name: string;
  description: string;
  availableTo: Macro['availableTo'];
  active: boolean;
  status: string;
  priority: string;
  tags: string[];
  publicReply: string;
  internalNote: string;
}

const blank: Draft = { name: '', description: '', availableTo: 'all', active: true, status: '', priority: '', tags: [], publicReply: '', internalNote: '' };

const fromMacro = (m: Macro): Draft => ({
  name: m.name,
  description: m.description ?? '',
  availableTo: m.availableTo,
  active: m.active,
  status: m.actions.status ?? '',
  priority: m.actions.priority ?? '',
  tags: m.actions.addTags ?? [],
  // Modo real: o backend guarda markdown; edita-se o texto como ele é (nada de formatação perdida).
  publicReply: IS_REAL && m.bodyMarkdown !== undefined ? m.bodyMarkdown : htmlToText(m.actions.publicReply ?? ''),
  internalNote: htmlToText(m.actions.internalNote ?? ''),
});

export default function MacroEdit() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const canWrite = useCan(MACRO_WRITE);
  const statuses = useTickets((s) => s.statuses);
  const state = useAsync(async () => {
    await useTickets.getState().loadStatuses();
    return isNew ? null : macrosApi.getMacro(id!);
  });
  const [draft, setDraft] = useState<Draft>(blank);
  const [loaded, setLoaded] = useState<Macro | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (state.loading || state.error) return;
    setLoaded(state.data ?? null);
    setDraft(state.data ? fromMacro(state.data) : blank);
  }, [state.data, state.loading, state.error]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (!canWrite) return;
    if (!draft.name.trim()) {
      setNameError('Informe o nome da macro.');
      return;
    }
    setNameError(undefined);
    setSaving(true);
    setSaveError(null);
    try {
      await macrosApi.saveMacro({
        ...(loaded ?? { usage7d: 0 }),
        id: loaded?.id,
        ...(IS_REAL ? { bodyMarkdown: draft.publicReply.trim() } : {}),
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        availableTo: draft.availableTo,
        active: draft.active,
        actions: {
          status: draft.status || undefined,
          priority: (draft.priority || undefined) as Priority | undefined,
          addTags: draft.tags.length ? draft.tags : undefined,
          publicReply: draft.publicReply.trim() ? textToHtml(draft.publicReply) : undefined,
          internalNote: draft.internalNote.trim() ? textToHtml(draft.internalNote) : undefined,
        },
      });
      toast.success(isNew ? 'Macro criada' : 'Macro atualizada');
      navigate('/admin/macros');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Não foi possível salvar a macro. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const breadcrumb = [{ label: 'Espaços de trabalho' }, { label: 'Macros', to: '/admin/macros' }, { label: isNew ? 'Nova macro' : draft.name || 'Macro' }];

  if (state.error) {
    return (
      <div className="flex min-h-full flex-col bg-surface">
        <PageHeader breadcrumb={breadcrumb} title="Macro" />
        <div className="p-6">
          <Banner tone="error" onRetry={state.reload}>
            {state.error}
          </Banner>
        </div>
      </div>
    );
  }
  if (state.loading) {
    return (
      <div className="flex min-h-full flex-col bg-surface" aria-busy="true">
        <PageHeader breadcrumb={breadcrumb} title="Macro" />
        <div className="p-6">
          <SkeletonText lines={6} label="Carregando macro" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader breadcrumb={breadcrumb} title={isNew ? 'Criar macro' : draft.name || 'Macro'} />
      {/* Sem `macro.manage` a macro é só consulta: o `fieldset` desabilita todos os campos de uma vez. */}
      <fieldset disabled={!canWrite} className="flex max-w-3xl flex-1 flex-col gap-5 border-0 p-0 px-6 py-6">
        {canWrite ? null : <Banner tone="info">Somente leitura: criar e editar macros exige a permissão de gerenciar macros (administradores).</Banner>}
        {saveError ? (
          <Banner tone="error" onRetry={() => void save()}>
            {saveError}
          </Banner>
        ) : null}
        <Field label="Nome da macro" required error={nameError}>
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Descrição" hint={IS_REAL ? 'Somente neste navegador.' : undefined}>
          <Textarea minRows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Disponível para" hint={IS_REAL ? 'Somente neste navegador: no backend toda macro vale para todos os agentes.' : undefined}>
          <Select
            className="w-80"
            value={draft.availableTo}
            onValueChange={(v) => set({ availableTo: v as Macro['availableTo'] })}
            options={(Object.keys(AVAILABLE_TO_LABEL) as Macro['availableTo'][]).map((k) => ({ value: k, label: AVAILABLE_TO_LABEL[k] }))}
          />
        </Field>
        <Switch checked={draft.active} onCheckedChange={(active) => set({ active })} label="Macro ativa" />

        <h2 className="mt-2 text-md font-semibold text-fg">Ações</h2>
        <p className="-mt-3 text-sm text-fg-muted">Ao aplicar a macro, estas alterações são feitas no ticket antes do envio.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Definir status" hint={IS_REAL ? 'Somente neste navegador: o backend não tem esta ação.' : undefined}>
            <Select
              value={draft.status}
              onValueChange={(v) => set({ status: v })}
              options={[{ value: '', label: '— Não alterar —' }, ...statuses.filter((s) => s.active !== false || s.id === draft.status).map((s) => ({ value: s.id, label: s.agentName }))]}
            />
          </Field>
          <Field label="Definir prioridade">
            <Select
              value={draft.priority}
              onValueChange={(v) => set({ priority: v })}
              options={[{ value: '', label: '— Não alterar —' }, ...(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))]}
            />
          </Field>
        </div>
        <Field label="Adicionar tags">
          <TagInput value={draft.tags} onChange={(tags) => set({ tags })} placeholder="Digite e pressione Enter" />
        </Field>
        <Field label="Resposta pública" hint={IS_REAL ? 'Markdown: **negrito**, _itálico_, listas com "- " e links [texto](https://...). Use {{solicitante}}, {{empresa}} e {{referencia}} para preencher dados do ticket.' : 'Parágrafos separados por uma linha em branco.'}>
          <Textarea minRows={5} value={draft.publicReply} onChange={(e) => set({ publicReply: e.target.value })} />
        </Field>
        <Field label="Nota interna" hint={IS_REAL ? 'Somente neste navegador: o backend não tem nota interna na macro.' : undefined}>
          <Textarea minRows={3} value={draft.internalNote} onChange={(e) => set({ internalNote: e.target.value })} />
        </Field>
      </fieldset>
      {canWrite ? (
        <EditFooter onCancel={() => navigate('/admin/macros')} onSave={() => void save()} saving={saving} />
      ) : (
        <div className="sticky bottom-0 z-10 flex items-center justify-end border-t border-line bg-surface px-6 py-3">
          <button type="button" onClick={() => navigate('/admin/macros')} className="rounded-xs text-sm text-action outline-none hover:text-action-hover focus-visible:shadow-focus">
            Voltar às macros
          </button>
        </div>
      )}
    </div>
  );
}
