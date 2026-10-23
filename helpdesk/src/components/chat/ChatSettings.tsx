import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import * as chatApi from '@/api/chat';
import { ApiError } from '@/api/errors';
import { Banner, Button, ConfirmModal, Field, IconButton, Input, Modal, Pill, Select, SkeletonRows, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { toast } from '@/store/useUi';
import type { ChatBannedWord, ChatCloseReason, ChatConfig, ChatQuickReply } from '@/types/chat';
import { useChatLookups } from './useChatLookups';
import { useLoad } from './useLoad';

const refreshLookups = () => void useChatLookups.getState().load(true);
const fieldError = (e: unknown, key: string): string | undefined => (e instanceof ApiError ? e.fieldErrors?.[key]?.[0] : undefined);
const msg = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

/** Configurações do chat (só administrador): configuração geral, motivos, respostas rápidas e palavras bloqueadas. */
export function ChatSettings() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4" data-testid="chat-settings">
      <Tabs defaultValue="general">
        <TabsList aria-label="Configurações do chat">
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="reasons">Motivos de encerramento</TabsTrigger>
          <TabsTrigger value="quick">Respostas rápidas</TabsTrigger>
          <TabsTrigger value="words">Palavras bloqueadas</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="pt-4 outline-none">
          <GeneralSettings />
        </TabsContent>
        <TabsContent value="reasons" className="pt-4 outline-none">
          <ReasonsSettings />
        </TabsContent>
        <TabsContent value="quick" className="pt-4 outline-none">
          <QuickRepliesSettings />
        </TabsContent>
        <TabsContent value="words" className="pt-4 outline-none">
          <WordsSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <SkeletonRows rows={4} columns={2} label={label} />;
}

function Head({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-md font-semibold text-fg">{title}</h2>
        <p className="max-w-[68ch] text-sm text-fg-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------ configuração geral ------------------------------ */

type Draft = Record<'welcomeMessage' | 'queueTimeoutMinutes' | 'maxChatsPerAgent' | 'scoreMin' | 'scoreMax' | 'lowScoreThreshold' | 'inactivityWarningMinutes' | 'inactivityCloseMinutes' | 'defaultTeamId', string>;

const toDraft = (c: ChatConfig): Draft => ({
  welcomeMessage: c.welcomeMessage,
  queueTimeoutMinutes: String(c.queueTimeoutMinutes),
  maxChatsPerAgent: String(c.maxChatsPerAgent),
  scoreMin: String(c.scoreMin),
  scoreMax: String(c.scoreMax),
  lowScoreThreshold: String(c.lowScoreThreshold),
  inactivityWarningMinutes: String(c.inactivityWarningMinutes),
  inactivityCloseMinutes: String(c.inactivityCloseMinutes),
  defaultTeamId: c.defaultTeamId ?? '',
});

const INT_FIELDS: { key: keyof Draft; label: string; hint?: string; min: number }[] = [
  { key: 'queueTimeoutMinutes', label: 'Tempo máximo na fila (minutos)', hint: 'Passado esse tempo sem ninguém pegar, a conversa vira um ticket "Chat não atendido".', min: 1 },
  { key: 'maxChatsPerAgent', label: 'Chats simultâneos por agente', hint: 'No limite, o agente deixa de receber o aviso de chat novo e não consegue pegar outro.', min: 1 },
  { key: 'scoreMin', label: 'Nota mínima da avaliação', min: 0 },
  { key: 'scoreMax', label: 'Nota máxima da avaliação', min: 1 },
  { key: 'lowScoreThreshold', label: 'Nota abaixo da qual o cliente justifica', hint: 'Notas menores que esta exigem justificativa do cliente.', min: 0 },
  { key: 'inactivityWarningMinutes', label: 'Aviso de inatividade (minutos)', hint: '0 desliga o aviso.', min: 0 },
  { key: 'inactivityCloseMinutes', label: 'Encerramento por inatividade (minutos)', hint: '0 desliga o encerramento automático.', min: 0 },
];

function GeneralSettings() {
  const cfg = useLoad('config', () => chatApi.getChatConfig());
  const teams = useChatLookups((s) => s.teams);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (cfg.data) setDraft(toDraft(cfg.data));
  }, [cfg.data]);

  if (cfg.loading && !cfg.data) return <Loading label="Carregando configuração" />;
  if (cfg.error || !cfg.data || !draft)
    return (
      <Banner tone="error" title="Não foi possível carregar a configuração" onRetry={cfg.reload} retryLabel="Tentar novamente">
        {cfg.error}
      </Banner>
    );

  const set = (k: keyof Draft, v: string) => {
    setDraft({ ...draft, [k]: v });
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = async () => {
    const next: typeof errors = {};
    if (!draft.welcomeMessage.trim()) next.welcomeMessage = 'Escreva a mensagem de boas-vindas.';
    for (const f of INT_FIELDS) {
      const raw = draft[f.key].trim();
      const n = Number(raw);
      if (raw === '' || !Number.isInteger(n) || n < f.min) next[f.key] = `Use um número inteiro a partir de ${f.min}.`;
    }
    const n = (k: keyof Draft) => Number(draft[k]);
    if (!next.scoreMax && !next.scoreMin && n('scoreMin') >= n('scoreMax')) next.scoreMax = 'O máximo da escala precisa ser maior que o mínimo.';
    if (!next.lowScoreThreshold && !next.scoreMax && !next.scoreMin && (n('lowScoreThreshold') < n('scoreMin') || n('lowScoreThreshold') > n('scoreMax'))) next.lowScoreThreshold = 'O gatilho precisa caber na escala de notas.';
    if (!next.inactivityWarningMinutes && !next.inactivityCloseMinutes && n('inactivityWarningMinutes') && n('inactivityCloseMinutes') && n('inactivityWarningMinutes') >= n('inactivityCloseMinutes')) {
      next.inactivityWarningMinutes = 'O aviso precisa vir antes do encerramento. Use um tempo menor.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      const saved = await chatApi.saveChatConfig({
        welcomeMessage: draft.welcomeMessage,
        queueTimeoutMinutes: n('queueTimeoutMinutes'),
        maxChatsPerAgent: n('maxChatsPerAgent'),
        scoreMin: n('scoreMin'),
        scoreMax: n('scoreMax'),
        lowScoreThreshold: n('lowScoreThreshold'),
        defaultTeamId: draft.defaultTeamId || null,
        inactivityWarningMinutes: n('inactivityWarningMinutes'),
        inactivityCloseMinutes: n('inactivityCloseMinutes'),
      });
      setDraft(toDraft(saved));
      toast.success('Configuração do chat salva.');
      refreshLookups();
    } catch (e) {
      const server: typeof errors = {};
      const map: Record<string, keyof Draft> = { welcome_message: 'welcomeMessage', score_max: 'scoreMax', score_min: 'scoreMin', low_score_threshold: 'lowScoreThreshold', inactivity_warning_minutes: 'inactivityWarningMinutes', inactivity_close_minutes: 'inactivityCloseMinutes', queue_timeout_minutes: 'queueTimeoutMinutes', max_chats_per_agent: 'maxChatsPerAgent' };
      for (const [api, key] of Object.entries(map)) server[key] = fieldError(e, api);
      setErrors(server);
      toast.error(msg(e, 'Não foi possível salvar a configuração.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Head title="Configuração geral" description="Valem para todo o atendimento por chat. A mensagem de boas-vindas aceita a variável {{nome_do_cliente}}." />
      {!cfg.data.queueOpen ? <Banner tone="info">A fila está fechada agora (fora do expediente){cfg.data.queueOpensAt ? '' : '.'}</Banner> : null}
      <Field label="Mensagem de boas-vindas" required error={errors.welcomeMessage}>
        <Textarea value={draft.welcomeMessage} onChange={(e) => set('welcomeMessage', e.target.value)} minRows={3} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {INT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint} error={errors[f.key]}>
            <Input type="number" inputMode="numeric" min={f.min} value={draft[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          </Field>
        ))}
        <Field label="Equipe da conversão automática" hint="Recebe o ticket quando ninguém pega a conversa a tempo.">
          <Select value={draft.defaultTeamId || undefined} onValueChange={(v) => set('defaultTeamId', v)} options={teams.map((t) => ({ value: t.id, label: t.name }))} placeholder="Escolha a equipe" />
        </Field>
      </div>
      <Button type="submit" variant="primary" loading={saving}>
        Salvar configuração
      </Button>
    </form>
  );
}

/* ------------------------------ motivos de encerramento ------------------------------ */

function ReasonsSettings() {
  const list = useLoad('reasons', () => chatApi.listCloseReasons());
  const [editing, setEditing] = useState<Partial<ChatCloseReason> | null>(null);
  const [removing, setRemoving] = useState<ChatCloseReason | null>(null);
  const reasons = list.data ?? [];
  return (
    <div className="max-w-3xl">
      <Head
        title="Motivos de encerramento"
        description="O agente escolhe um destes motivos ao encerrar. Um motivo que exige observação obriga o agente a escrever uma nota interna. Desative em vez de apagar para manter o histórico legível."
        action={
          <Button variant="primary" leadingIcon={<Plus aria-hidden className="h-4 w-4" />} onClick={() => setEditing({ requiresNote: false, active: true })}>
            Novo motivo
          </Button>
        }
      />
      {list.loading && !list.data ? <Loading label="Carregando motivos" /> : null}
      {list.error ? (
        <Banner tone="error" title="Não foi possível carregar os motivos" onRetry={list.reload} retryLabel="Tentar novamente">
          {list.error}
        </Banner>
      ) : null}
      {list.data && reasons.length === 0 ? <p className="rounded border border-dashed border-line-strong p-4 text-sm text-fg-muted">Nenhum motivo cadastrado. Crie o primeiro com "Novo motivo".</p> : null}
      {reasons.length > 0 ? (
        <ul aria-label="Motivos de encerramento" className="divide-y divide-line rounded border border-line">
          {reasons.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{r.name}</span>
              {r.requiresNote ? <Pill tone="note">Exige observação</Pill> : null}
              <Pill tone={r.active ? 'action' : 'neutral'}>{r.active ? 'Ativo' : 'Inativo'}</Pill>
              <IconButton label={`Editar ${r.name}`} icon={<Pencil aria-hidden className="h-4 w-4" />} onClick={() => setEditing(r)} />
              <IconButton label={`Apagar ${r.name}`} icon={<Trash2 aria-hidden className="h-4 w-4" />} onClick={() => setRemoving(r)} />
            </li>
          ))}
        </ul>
      ) : null}
      <ReasonModal
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          list.reload();
          refreshLookups();
        }}
      />
      <ConfirmModal
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Apagar motivo?"
        description={`O motivo "${removing?.name ?? ''}" deixa de existir. Se já foi usado em atendimentos, o servidor recusa: desative-o. Esta ação não pode ser desfeita.`}
        confirmLabel="Apagar motivo"
        onConfirm={async () => {
          try {
            await chatApi.deleteCloseReason(removing!.id);
            toast.success('Motivo apagado.');
            list.reload();
            refreshLookups();
          } catch (e) {
            toast.error(msg(e, 'Não foi possível apagar o motivo.'));
            throw e;
          }
        }}
      />
    </div>
  );
}

function ReasonModal({ value, onClose, onSaved }: { value: Partial<ChatCloseReason> | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [requiresNote, setRequiresNote] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value) {
      setName(value.name ?? '');
      setRequiresNote(Boolean(value.requiresNote));
      setActive(value.active ?? true);
      setError(undefined);
    }
  }, [value]);
  const save = async () => {
    if (!name.trim()) {
      setError('Informe o nome do motivo.');
      return;
    }
    setBusy(true);
    try {
      await chatApi.saveCloseReason({ id: value?.id, name, requiresNote, active, order: value?.order });
      toast.success('Motivo salvo.');
      onSaved();
    } catch (e) {
      setError(fieldError(e, 'name') ?? fieldError(e, 'slug') ?? msg(e, 'Não foi possível salvar o motivo.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={value !== null}
      onOpenChange={(o) => !o && onClose()}
      title={value?.id ? 'Editar motivo' : 'Novo motivo'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Nome do motivo" required error={error}>
          <Input value={name} maxLength={60} onChange={(e) => (setName(e.target.value), setError(undefined))} />
        </Field>
        <Switch checked={requiresNote} onCheckedChange={setRequiresNote} label="Exige observação interna ao encerrar" />
        <Switch checked={active} onCheckedChange={setActive} label="Ativo (aparece ao encerrar)" />
      </div>
    </Modal>
  );
}

/* ------------------------------ respostas rápidas ------------------------------ */

const CONTEXT_LABEL = { chat: 'Abre o chat', ticket: 'Responde ao chamado' } as const;

function QuickRepliesSettings() {
  const list = useLoad('quick', () => chatApi.listQuickReplies());
  const [editing, setEditing] = useState<Partial<ChatQuickReply> | null>(null);
  const [removing, setRemoving] = useState<ChatQuickReply | null>(null);
  const items = list.data ?? [];
  return (
    <div className="max-w-3xl">
      <Head
        title="Respostas rápidas"
        description="Frases prontas do atendimento por chat. No compositor, digite / para buscar e inserir uma resposta. As de contexto 'Responde ao chamado' são oferecidas ao cliente no portal."
        action={
          <Button variant="primary" leadingIcon={<Plus aria-hidden className="h-4 w-4" />} onClick={() => setEditing({ context: 'chat', active: true })}>
            Nova resposta
          </Button>
        }
      />
      {list.loading && !list.data ? <Loading label="Carregando respostas rápidas" /> : null}
      {list.error ? (
        <Banner tone="error" title="Não foi possível carregar as respostas rápidas" onRetry={list.reload} retryLabel="Tentar novamente">
          {list.error}
        </Banner>
      ) : null}
      {list.data && items.length === 0 ? <p className="rounded border border-dashed border-line-strong p-4 text-sm text-fg-muted">Nenhuma resposta rápida cadastrada.</p> : null}
      {items.length > 0 ? (
        <ul aria-label="Respostas rápidas" className="divide-y divide-line rounded border border-line">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">{r.label}</span>
                <span className="block truncate text-xs text-fg-muted">{r.text}</span>
              </span>
              <Pill>{CONTEXT_LABEL[r.context]}</Pill>
              <Pill tone={r.active ? 'action' : 'neutral'}>{r.active ? 'Ativa' : 'Inativa'}</Pill>
              <IconButton label={`Editar ${r.label}`} icon={<Pencil aria-hidden className="h-4 w-4" />} onClick={() => setEditing(r)} />
              <IconButton label={`Apagar ${r.label}`} icon={<Trash2 aria-hidden className="h-4 w-4" />} onClick={() => setRemoving(r)} />
            </li>
          ))}
        </ul>
      ) : null}
      <QuickReplyModal
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          list.reload();
          refreshLookups();
        }}
      />
      <ConfirmModal
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Apagar resposta rápida?"
        description={`A resposta "${removing?.label ?? ''}" deixa de estar disponível. Esta ação não pode ser desfeita.`}
        confirmLabel="Apagar resposta"
        onConfirm={async () => {
          try {
            await chatApi.deleteQuickReply(removing!.id);
            toast.success('Resposta apagada.');
            list.reload();
            refreshLookups();
          } catch (e) {
            toast.error(msg(e, 'Não foi possível apagar a resposta.'));
            throw e;
          }
        }}
      />
    </div>
  );
}

function QuickReplyModal({ value, onClose, onSaved }: { value: Partial<ChatQuickReply> | null; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [context, setContext] = useState<'chat' | 'ticket'>('chat');
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<{ label?: string; text?: string }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value) {
      setLabel(value.label ?? '');
      setText(value.text ?? '');
      setContext(value.context ?? 'chat');
      setActive(value.active ?? true);
      setErrors({});
    }
  }, [value]);
  const save = async () => {
    const next: typeof errors = {};
    if (!label.trim()) next.label = 'Informe o rótulo.';
    if (!text.trim()) next.text = 'Escreva o texto da resposta.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      await chatApi.saveQuickReply({ id: value?.id, context, label, text, active, order: value?.order });
      toast.success('Resposta salva.');
      onSaved();
    } catch (e) {
      setErrors({ label: fieldError(e, 'rotulo') ?? fieldError(e, 'non_field_errors'), text: fieldError(e, 'texto') });
      if (!fieldError(e, 'rotulo') && !fieldError(e, 'texto') && !fieldError(e, 'non_field_errors')) toast.error(msg(e, 'Não foi possível salvar a resposta.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={value !== null}
      onOpenChange={(o) => !o && onClose()}
      title={value?.id ? 'Editar resposta rápida' : 'Nova resposta rápida'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Rótulo" required error={errors.label} hint="Nome curto que aparece na busca (até 40 caracteres).">
          <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Texto" required error={errors.text} hint="Aceita {{solicitante}} (primeiro nome do cliente) e {{empresa}}.">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} minRows={4} />
        </Field>
        <Field label="Onde aparece">
          <Select value={context} onValueChange={(v) => setContext(v as 'chat' | 'ticket')} options={[{ value: 'chat', label: CONTEXT_LABEL.chat }, { value: 'ticket', label: CONTEXT_LABEL.ticket }]} />
        </Field>
        <Switch checked={active} onCheckedChange={setActive} label="Ativa" />
      </div>
    </Modal>
  );
}

/* ------------------------------ palavras bloqueadas ------------------------------ */

function WordsSettings() {
  const list = useLoad('words', () => chatApi.listBannedWords());
  const [word, setWord] = useState('');
  const [error, setError] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ChatBannedWord | null>(null);
  const words = list.data ?? [];

  const add = async () => {
    const value = word.trim().toLowerCase();
    if (!value) {
      setError('Informe a palavra.');
      return;
    }
    if (words.some((w) => w.word === value)) {
      setError('Esta palavra já está na lista.');
      return;
    }
    setAdding(true);
    try {
      await chatApi.addBannedWord(value);
      setWord('');
      setError(undefined);
      toast.success('Palavra adicionada.');
      list.reload();
    } catch (e) {
      setError(fieldError(e, 'word') ?? msg(e, 'Não foi possível adicionar a palavra.'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Head title="Palavras bloqueadas" description="Cada palavra da lista vira **** na exibição, para o cliente e para a equipe. O texto original continua guardado, então a lista vale também para mensagens antigas." />
      <form
        className="mb-4 flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="max-w-xs flex-1">
          <Field label="Nova palavra" error={error}>
            <Input value={word} maxLength={60} onChange={(e) => (setWord(e.target.value), setError(undefined))} />
          </Field>
        </div>
        <Button type="submit" variant="primary" className="mt-6" loading={adding} leadingIcon={<Plus aria-hidden className="h-4 w-4" />}>
          Adicionar
        </Button>
      </form>
      {list.loading && !list.data ? <Loading label="Carregando palavras" /> : null}
      {list.error ? (
        <Banner tone="error" title="Não foi possível carregar as palavras" onRetry={list.reload} retryLabel="Tentar novamente">
          {list.error}
        </Banner>
      ) : null}
      {list.data && words.length === 0 ? <p className="rounded border border-dashed border-line-strong p-4 text-sm text-fg-muted">Nenhuma palavra bloqueada.</p> : null}
      {words.length > 0 ? (
        <ul aria-label="Palavras bloqueadas" className="flex flex-wrap gap-2">
          {words.map((w) => (
            <li key={w.id}>
              <Pill removeLabel={`Apagar a palavra ${w.word}`} onRemove={() => setRemoving(w)}>
                {w.word}
              </Pill>
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmModal
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Apagar palavra bloqueada?"
        description={`A palavra "${removing?.word ?? ''}" volta a aparecer normalmente nas mensagens, inclusive nas antigas.`}
        confirmLabel="Apagar palavra"
        onConfirm={async () => {
          try {
            await chatApi.deleteBannedWord(removing!.id);
            toast.success('Palavra apagada.');
            list.reload();
          } catch (e) {
            toast.error(msg(e, 'Não foi possível apagar a palavra.'));
            throw e;
          }
        }}
      />
    </div>
  );
}
