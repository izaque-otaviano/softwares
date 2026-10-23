import { localHint } from '@/api/capabilities';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { removeKeepingFocus } from '@/components/ui/focusUtils';
import { usersApi } from '@/api';
import { useDirectory } from '@/components/lists/useDirectory';
import { Avatar, Button, Combobox, Field, Select, TagInput, type ComboOption } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useIsNarrow } from '@/lib/useMediaQuery';
import { PRIORITY_LABEL, TYPE_LABEL } from '@/lib/status';
import { useMeId } from '@/store/useSession';
import { useTickets } from '@/store/useTickets';
import type { Priority, TicketType, User } from '@/types/domain';
import { AddUserModal } from './AddUserModal';
import { AssigneePicker } from './AssigneePicker';
import { FollowerChips, FollowersField } from './CcFollowers';
import { useFormEntry, useFormStore } from './formStore';
import { useGroups, useTicketFields } from './useTicketLookups';

const ADD_USER = '__add_user__';
const NONE = '';

const TYPE_OPTIONS = [{ value: NONE, label: '—' }, ...(Object.keys(TYPE_LABEL) as TicketType[]).map((v) => ({ value: v, label: TYPE_LABEL[v] }))];
const PRIORITY_OPTIONS = [{ value: NONE, label: '—' }, ...(Object.keys(PRIORITY_LABEL) as Priority[]).map((v) => ({ value: v, label: PRIORITY_LABEL[v] }))];
const CONFIDENCE = ['50', '60', '70', '80', '90', '99'];

const READONLY_FIELDS: { id: string; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'resumo_agente_id', label: 'ID do agente do resumo' },
  { id: 'resumo_localidade', label: 'Localidade do resumo' },
  { id: 'resumo_data', label: 'Data e hora do resumo' },
];

const LINK = 'rounded text-xs font-normal text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none';

function userOption(u: User): ComboOption {
  return { value: u.id, label: u.name, description: u.email, icon: <Avatar name={u.name} size={20} decorative /> };
}

function RequesterField({ ticketKey, disabled, autoFocus }: { ticketKey: string; disabled: boolean; autoFocus: boolean }) {
  const entry = useFormEntry(ticketKey)!;
  const users = useDirectory();
  const ref = useRef<HTMLButtonElement>(null);
  const [adding, setAdding] = useState(false);
  const requesterId = entry.values.requesterId;

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const loadOptions = useCallback(
    async (query: string): Promise<ComboOption[]> => {
      const list = await usersApi.listUsers({ role: 'end_user', query });
      const options = list.slice(0, 30).map(userOption);
      const current = requesterId ? users.get(requesterId) : undefined;
      if (current && !options.some((o) => o.value === current.id)) options.unshift(userOption(current));
      return [...options, { value: ADD_USER, label: '+ Adicionar usuário' }];
    },
    [requesterId, users],
  );

  return (
    <>
      <Field label="Solicitante" error={entry.errors.requester}>
        <Combobox
          ref={ref}
          value={requesterId}
          disabled={disabled}
          loadOptions={loadOptions}
          placeholder="Buscar usuários"
          searchPlaceholder="Buscar por nome ou e-mail"
          emptyText="Nenhum usuário encontrado."
          onValueChange={(v) => {
            if (v === ADD_USER) setAdding(true);
            else if (v) useFormStore.getState().patch(ticketKey, { requesterId: v });
          }}
          renderOption={(o) =>
            o.value === ADD_USER ? (
              <span className="font-semibold text-action">{o.label}</span>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                {o.icon}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{o.label}</span>
                  <span className="truncate text-xs text-fg-muted">{o.description}</span>
                </span>
              </span>
            )
          }
        />
      </Field>
      <AddUserModal open={adding} onOpenChange={setAdding} onCreated={(u) => useFormStore.getState().patch(ticketKey, { requesterId: u.id })} />
    </>
  );
}

function AssigneeField({ ticketKey, disabled }: { ticketKey: string; disabled: boolean }) {
  const entry = useFormEntry(ticketKey)!;
  const groups = useGroups();
  const users = useDirectory();
  const meId = useMeId();
  const { assigneeGroupId, assigneeId } = entry.values;
  const accept = () => {
    const mine = groups.find((g) => g.agentIds.includes(meId));
    const current = groups.find((g) => g.id === assigneeGroupId);
    const group = current?.agentIds.includes(meId) ? current : mine;
    useFormStore.getState().patch(ticketKey, { assigneeId: meId, assigneeGroupId: group?.id ?? assigneeGroupId });
  };
  return (
    <Field
      label="Atribuído"
      required
      error={entry.errors.assignee}
      labelAction={
        assigneeId !== meId && !disabled ? (
          <button type="button" className={LINK} onClick={accept}>
            aceitar
          </button>
        ) : null
      }
    >
      <AssigneePicker
        value={{ groupId: assigneeGroupId, assigneeId }}
        groups={groups}
        users={users}
        disabled={disabled}
        onChange={(v) => useFormStore.getState().patch(ticketKey, { assigneeGroupId: v.groupId, assigneeId: v.assigneeId })}
      />
    </Field>
  );
}

function ReadonlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-fg">{label}</div>
      <div className="min-h-8 whitespace-pre-wrap break-words rounded bg-surface-2 px-2 py-1.5 text-sm text-fg" data-readonly-field>
        {value || '—'}
      </div>
    </div>
  );
}

function AiFields({ ticketKey, disabled, open, onToggle }: { ticketKey: string; disabled: boolean; open: boolean; onToggle: () => void }) {
  const entry = useFormEntry(ticketKey)!;
  const defs = useTicketFields();
  const cf = entry.values.customFields;
  const set = (id: string, value: string) => useFormStore.getState().patch(ticketKey, { customFields: { ...cf, [id]: value || undefined } });
  const choices = (id: string, fallback: string[]) => {
    const list = defs.find((d) => d.id === id)?.options ?? fallback;
    const current = cf[id];
    return current && !list.includes(current) ? [...list, current] : list;
  };
  const dropdown = (id: string, label: string, list: string[], percent = false) => {
    const opts = [{ value: NONE, label: '—' }, ...list.map((v) => ({ value: v, label: percent ? `${v}%` : v }))];
    return (
      <Field key={id} label={label}>
        <Select value={cf[id] ?? NONE} options={opts} disabled={disabled} onValueChange={(v) => set(id, v)} />
      </Field>
    );
  };
  const confidence = (id: string): string[] => {
    const current = cf[id];
    return current && !CONFIDENCE.includes(current) ? [...CONFIDENCE, current] : CONFIDENCE;
  };
  const regionId = `ai-fields-${ticketKey}`;
  return (
    <section aria-label="Campos de IA">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={onToggle}
        className="flex h-8 w-full items-center gap-1 rounded px-1 text-left text-xs font-semibold text-fg hover:bg-hover focus-visible:shadow-focus focus-visible:outline-none"
      >
        {open ? <ChevronDown aria-hidden="true" className="size-4 text-fg-muted" /> : <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" />}
        <Sparkles aria-hidden="true" className="size-3.5 text-ai" />
        Campos de IA
      </button>
      {open ? (
        <div id={regionId} className="mt-2 space-y-3">
          {/* Resumo, tópico, sentimento e idioma são campos personalizados (locais); o resumo por IA do servidor fica na conversa. */}
          {localHint('customFields') ? <p className="text-xs text-fg-muted">{localHint('customFields', 'Somente neste navegador: o backend ainda não tem estes campos de IA.')}</p> : null}
          {READONLY_FIELDS.map((f) => (
            <ReadonlyField key={f.id} label={f.label} value={cf[f.id]} />
          ))}
          {dropdown('topico', 'Tópico', choices('topico', []))}
          {dropdown('topico_confianca', 'Confiança do tópico', confidence('topico_confianca'), true)}
          {dropdown('sentimento', 'Sentimento', choices('sentimento', ['Positivo', 'Neutro', 'Negativo']))}
          {dropdown('sentimento_confianca', 'Confiança do sentimento', confidence('sentimento_confianca'), true)}
          {dropdown('idioma', 'Idioma', choices('idioma', ['Português', 'Inglês', 'Espanhol']))}
          {dropdown('idioma_confianca', 'Confiança do idioma', confidence('idioma_confianca'), true)}
        </div>
      ) : null}
    </section>
  );
}

function SetupCard({ onStart }: { onStart: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  const ref = useRef<HTMLElement>(null);
  if (dismissed) return null;
  return (
    <aside ref={ref} aria-label="Configuração em 2 minutos" className="rounded border border-line bg-surface-1 p-3">
      <p className="text-sm font-semibold text-fg">Configuração em 2 minutos</p>
      <p className="mt-1 text-xs text-fg-muted">Personalize as informações do seu ticket</p>
      <div className="mt-3 flex gap-2">
        <Button size="md" variant="primary" onClick={onStart}>
          Começar agora
        </Button>
        <Button size="md" variant="ghost" onClick={() => removeKeepingFocus(ref.current, () => setDismissed(true))}>
          Descartar
        </Button>
      </div>
    </aside>
  );
}

/**
 * Grupo de campos. Em tela larga é só um contêiner; abaixo de 1024 px vira seção de acordeão
 * (o conteúdo fica montado, só escondido, para não perder foco nem estado).
 */
function PropertyGroup({ id, title, narrow, open, onToggle, children }: { id: string; title: string; narrow: boolean; open: boolean; onToggle: () => void; children: ReactNode }) {
  if (!narrow) return <>{children}</>;
  return (
    <section aria-label={title} className="border-b border-line pb-2 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`prop-group-${id}`}
        onClick={onToggle}
        className="flex h-8 w-full items-center gap-1 rounded px-1 text-left text-xs font-semibold text-fg hover:bg-hover focus-visible:shadow-focus focus-visible:outline-none"
      >
        {open ? <ChevronDown aria-hidden="true" className="size-4 text-fg-muted" /> : <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" />}
        {title}
      </button>
      <div id={`prop-group-${id}`} hidden={!open} className="mt-2 space-y-3">
        {children}
      </div>
    </section>
  );
}

/** Propriedades do ticket (`w-props`, rola sozinho). Tudo que se edita aqui fica PENDENTE no formStore até o envio. */
export function PropertiesPanel({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey);
  const allTags = useTickets((s) => s.tickets);
  const narrow = useIsNarrow();
  const [aiOpen, setAiOpen] = useState(!narrow);
  // Acordeão (< 1024 px): abre só o primeiro grupo; erros de validação reabrem o grupo do campo.
  const [groups, setGroups] = useState<Record<string, boolean>>({ people: true, classify: false });
  const toggleGroup = (id: string) => setGroups((g) => ({ ...g, [id]: !g[id] }));
  const hasPeopleError = Boolean(entry?.errors.requester || entry?.errors.assignee);
  useEffect(() => {
    if (hasPeopleError) setGroups((g) => ({ ...g, people: true }));
  }, [hasPeopleError]);
  const suggestions = useMemo(() => [...new Set(allTags.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [allTags]);
  if (!entry) return null;
  const { values } = entry;
  const disabled = entry.submitting;
  const patch = useFormStore.getState().patch;

  return (
    <aside aria-label="Propriedades do ticket" className={cn('flex w-props shrink-0 flex-col overflow-y-auto border-r border-line bg-surface-1')}>
      <div className="space-y-3 p-4">
        <PropertyGroup id="people" title="Solicitante e atribuição" narrow={narrow} open={groups.people} onToggle={() => toggleGroup('people')}>
          <RequesterField ticketKey={ticketKey} disabled={disabled} autoFocus={entry.isNew && !values.requesterId} />
          <AssigneeField ticketKey={ticketKey} disabled={disabled} />
          <FollowersField ticketKey={ticketKey} disabled={disabled} />
          <FollowerChips ticketKey={ticketKey} disabled={disabled} />
        </PropertyGroup>
        <PropertyGroup id="classify" title="Classificação" narrow={narrow} open={groups.classify} onToggle={() => toggleGroup('classify')}>
          <Field label="Tags">
            <TagInput value={values.tags} disabled={disabled} suggestions={suggestions} placeholder="Adicionar tag" onChange={(tags) => patch(ticketKey, { tags })} />
          </Field>
          <Field label="Tipo">
            <Select value={values.type ?? NONE} options={TYPE_OPTIONS} disabled={disabled} onValueChange={(v) => patch(ticketKey, { type: (v || null) as TicketType | null })} />
          </Field>
          <Field label="Prioridade">
            <Select value={values.priority ?? NONE} options={PRIORITY_OPTIONS} disabled={disabled} onValueChange={(v) => patch(ticketKey, { priority: (v || null) as Priority | null })} />
          </Field>
        </PropertyGroup>
        <AiFields ticketKey={ticketKey} disabled={disabled} open={aiOpen} onToggle={() => setAiOpen((o) => !o)} />
        <SetupCard onStart={() => setAiOpen(true)} />
      </div>
    </aside>
  );
}
