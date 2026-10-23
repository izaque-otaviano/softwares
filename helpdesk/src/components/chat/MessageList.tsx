import { ArrowDown, Check, CheckCheck, CornerUpLeft, Download, FileText, Loader2, MoreVertical, Paperclip, StickyNote, TriangleAlert } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar, Button, Menu, MenuContent, MenuItems, MenuTrigger, Textarea, type MenuItemSpec } from '@/components/ui';
import { cn } from '@/lib/cn';
import { isMineMessage } from '@/store/chat';
import type { ChatFile, ChatMessage } from '@/types/chat';
import { clockTime, dayKey, dayLabel, DELIVERY_LABEL, deliveryState, formatBytes } from './chatUtils';

const STICK_PX = 96;

export interface MessageListProps {
  messages: ChatMessage[];
  pending: ChatMessage[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadOlder: () => void;
  typingName: string | null;
  /** Conversa aceita resposta de quem está logado (habilita responder/editar/apagar). */
  canWrite: boolean;
  onReply: (m: ChatMessage) => void;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
  /** Muda a cada abertura de conversa: reposiciona a rolagem no fim. */
  resetKey: string;
}

/** Linha do tempo da conversa: rolagem ancorada no fim, separador por dia, "carregar anteriores" no topo. */
export function MessageList(props: MessageListProps) {
  const { messages, pending, hasMore, loadingMore, onLoadOlder, typingName, canWrite, onReply, onEdit, onDelete, onRetry, onDiscard, resetKey } = props;
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const lastCount = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const scrollToEnd = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Outra conversa: começa no fim.
  useLayoutEffect(() => {
    stuck.current = true;
    lastCount.current = 0;
    prevHeight.current = null;
    setUnseen(0);
    setEditingId(null);
  }, [resetKey]);

  const total = messages.length + pending.length;
  const lastId = messages.at(-1)?.id;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      // Mensagens antigas entraram no topo: mantém o que o agente estava lendo no mesmo lugar.
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
      lastCount.current = total;
      return;
    }
    const grew = total > lastCount.current;
    if (stuck.current) {
      scrollToEnd();
      setUnseen(0);
    } else if (grew && lastCount.current > 0) {
      setUnseen((n) => n + (total - lastCount.current));
    }
    lastCount.current = total;
  }, [total, lastId, typingName, scrollToEnd]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    stuck.current = near;
    if (near) setUnseen(0);
  };

  const loadOlder = () => {
    prevHeight.current = ref.current?.scrollHeight ?? null;
    onLoadOlder();
  };

  const lastOwnId = [...messages].reverse().find((m) => !m.isSystem)?.id;
  const now = new Date();
  let previousDay = '';

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} onScroll={onScroll} role="log" aria-label="Mensagens da conversa" aria-live="polite" aria-relevant="additions" tabIndex={0} className="h-full overflow-y-auto px-4 py-3 outline-none focus-visible:shadow-focus">
        {hasMore ? (
          <div className="mb-3 flex justify-center">
            <Button variant="outline" size="md" loading={loadingMore} onClick={loadOlder}>
              Carregar mensagens anteriores
            </Button>
          </div>
        ) : null}
        <ol className="flex flex-col gap-2">
          {[...messages, ...pending].map((m) => {
            const day = dayKey(m.sentAt);
            const showDay = day !== previousDay;
            previousDay = day;
            const mine = m.authorIsInternal || m.state !== 'sent';
            const editable = canWrite && m.id === lastOwnId && isMineMessage(m) && !m.deleted && m.state === 'sent' && !m.isSystem;
            return (
              <Fragment key={m.id}>
                {showDay ? (
                  <li className="my-2 flex justify-center" aria-hidden={false}>
                    <span className="rounded-pill bg-surface-2 px-3 py-0.5 text-xs text-fg-muted">{dayLabel(m.sentAt, now)}</span>
                  </li>
                ) : null}
                {m.isSystem ? (
                  <li className="flex justify-center">
                    <span className="max-w-[90%] rounded-pill bg-surface-1 px-3 py-0.5 text-center text-xs text-fg-muted">
                      {m.body} <time dateTime={m.sentAt}>{clockTime(m.sentAt)}</time>
                    </span>
                  </li>
                ) : (
                  <MessageItem
                    message={m}
                    mine={mine}
                    canWrite={canWrite}
                    editable={editable}
                    editing={editingId === m.id}
                    onStartEdit={() => setEditingId(m.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onEdit={async (body) => {
                      const ok = await onEdit(m.id, body);
                      if (ok) setEditingId(null);
                    }}
                    onDelete={() => onDelete(m.id)}
                    onReply={() => onReply(m)}
                    onRetry={() => onRetry(m.id)}
                    onDiscard={() => onDiscard(m.id)}
                  />
                )}
              </Fragment>
            );
          })}
        </ol>
        {typingName ? (
          <p role="status" className="mt-2 flex items-center gap-2 text-xs italic text-fg-muted">
            <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
            {typingName} está digitando...
          </p>
        ) : null}
      </div>
      {unseen > 0 ? (
        <button
          type="button"
          onClick={() => {
            stuck.current = true;
            scrollToEnd();
            setUnseen(0);
          }}
          className="absolute bottom-3 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-pill bg-ink px-3 text-xs font-semibold text-fg-inverse shadow-pop outline-none hover:bg-ink-active focus-visible:shadow-focus"
        >
          <ArrowDown aria-hidden className="h-3.5 w-3.5" />
          {unseen === 1 ? '1 nova mensagem' : `${unseen} novas mensagens`}
        </button>
      ) : null}
    </div>
  );
}

interface MessageItemProps {
  message: ChatMessage;
  mine: boolean;
  canWrite: boolean;
  editable: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEdit: (body: string) => Promise<void>;
  onDelete: () => void;
  onReply: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

function MessageItem({ message: m, mine, canWrite, editable, editing, onStartEdit, onCancelEdit, onEdit, onDelete, onReply, onRetry, onDiscard }: MessageItemProps) {
  const [draft, setDraft] = useState(m.body);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (editing) setDraft(m.body);
  }, [editing, m.body]);

  const note = m.isInternalNote;
  const delivery = mine && !note ? deliveryState(m) : null;
  const items: MenuItemSpec[] = [];
  if (canWrite && !m.deleted && m.state === 'sent') items.push({ id: 'reply', label: 'Responder', icon: <CornerUpLeft aria-hidden className="h-4 w-4" />, onSelect: onReply });
  if (editable) {
    items.push({ id: 'edit', label: 'Editar', onSelect: onStartEdit });
    items.push({ id: 'delete', label: 'Apagar', tone: 'danger', onSelect: onDelete });
  }

  return (
    <li data-testid="chat-message" data-kind={note ? 'note' : mine ? 'agent' : 'client'} className={cn('group flex gap-2', mine ? 'flex-row-reverse' : 'flex-row')}>
      <Avatar name={m.authorName} size={28} decorative />
      <article
        aria-label={`${note ? 'Nota interna' : 'Mensagem'} de ${m.authorName}, ${clockTime(m.sentAt)}`}
        className={cn('min-w-0 max-w-[80%] rounded border px-3 py-2', note ? 'border-note-badge bg-note-bg' : mine ? 'border-line bg-surface-1' : 'border-transparent bg-bubble-customer', m.state === 'failed' && 'border-danger')}
      >
        <header className={cn('mb-0.5 flex flex-wrap items-center gap-x-2 text-xs', mine && 'justify-end')}>
          <span className="font-bold text-fg">{m.authorName}</span>
          {note ? (
            <span className="inline-flex items-center gap-1 rounded-xs bg-note-badge px-1.5 py-0.5 text-2xs font-semibold text-note-badgeText">
              <StickyNote aria-hidden className="h-3 w-3" />
              Nota interna
            </span>
          ) : null}
          <time dateTime={m.sentAt} className="text-fg-muted">
            {clockTime(m.sentAt)}
          </time>
          {m.editedAt ? <span className="text-fg-muted">(editada)</span> : null}
          {items.length > 0 && !editing ? (
            <Menu>
              <MenuTrigger asChild>
                <button type="button" aria-label={`Ações da mensagem de ${m.authorName}`} className="inline-flex h-5 w-5 items-center justify-center rounded text-fg-muted opacity-0 outline-none hover:bg-hover focus-visible:opacity-100 focus-visible:shadow-focus group-hover:opacity-100 data-[state=open]:opacity-100">
                  <MoreVertical aria-hidden className="h-4 w-4" />
                </button>
              </MenuTrigger>
              <MenuContent align={mine ? 'end' : 'start'}>
                <MenuItems items={items} />
              </MenuContent>
            </Menu>
          ) : null}
        </header>
        {m.replyTo ? (
          <blockquote className="mb-1 rounded-xs border-l-2 border-line-strong bg-surface-2/60 px-2 py-1 text-xs text-fg-muted">
            <span className="font-semibold">{m.replyTo.authorName}</span>
            <span className="block truncate">{m.replyTo.deleted ? 'Mensagem apagada.' : m.replyTo.excerpt || (m.replyTo.hasFiles ? 'Anexo' : '')}</span>
          </blockquote>
        ) : null}
        {m.deleted ? (
          <p className="text-sm italic text-fg-muted">Esta mensagem foi apagada.</p>
        ) : editing ? (
          <div className="flex flex-col gap-2">
            <Textarea aria-label="Editar mensagem" value={draft} onChange={(e) => setDraft(e.target.value)} minRows={2} autoGrow />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={saving}
                disabled={!draft.trim() || draft.trim() === m.body}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onEdit(draft.trim());
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Salvar
              </Button>
            </div>
          </div>
        ) : m.body ? (
          <div
            className="break-words text-sm text-fg [&_a]:text-action [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_code]:rounded-xs [&_code]:bg-surface-2 [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-surface-2 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
          />
        ) : null}
        {m.files.length > 0 ? (
          <ul aria-label="Anexos" className="mt-1.5 flex flex-wrap gap-2">
            {m.files.map((f) => (
              <li key={f.id} className="max-w-full">
                <FileView file={f} />
              </li>
            ))}
          </ul>
        ) : null}
        <footer className={cn('flex items-center gap-2 text-xs empty:hidden', (delivery || m.state === 'failed') && 'mt-1 min-h-5', mine ? 'justify-end' : 'justify-start')}>
          {delivery ? (
            <span className={cn('inline-flex items-center gap-1', delivery === 'failed' ? 'text-danger' : delivery === 'read' ? 'text-action' : 'text-fg-muted')}>
              {delivery === 'sending' ? <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> : null}
              {delivery === 'failed' ? <TriangleAlert aria-hidden className="h-3 w-3" /> : null}
              {delivery === 'sent' ? <Check aria-hidden className="h-3.5 w-3.5" /> : null}
              {delivery === 'delivered' || delivery === 'read' ? <CheckCheck aria-hidden className="h-3.5 w-3.5" /> : null}
              <span>{DELIVERY_LABEL[delivery]}</span>
            </span>
          ) : null}
          {m.state === 'failed' ? (
            <>
              <button type="button" onClick={onRetry} className="rounded-xs text-action outline-none hover:underline focus-visible:shadow-focus">
                Tentar novamente
              </button>
              <button type="button" onClick={onDiscard} className="rounded-xs text-fg-muted outline-none hover:underline focus-visible:shadow-focus">
                Descartar
              </button>
            </>
          ) : null}
        </footer>
      </article>
    </li>
  );
}

function FileView({ file }: { file: ChatFile }) {
  const blocked = file.scanStatus === 'infected' || (file.scanStatus === 'error' && !file.downloadable);
  const scanning = file.scanStatus === 'pending';
  if (file.isImage && file.downloadable) {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border border-line outline-none focus-visible:shadow-focus">
        <img src={file.url} alt={file.name} loading="lazy" className="max-h-48 max-w-full object-contain" />
        <span className="block truncate bg-surface px-2 py-1 text-xs text-fg-muted">
          {file.name} ({formatBytes(file.size)})
        </span>
      </a>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded border border-line bg-surface px-2 py-1 text-xs">
      {file.contentType.startsWith('image/') ? <Paperclip aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-muted" /> : <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-muted" />}
      {file.downloadable ? (
        <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-action outline-none hover:underline focus-visible:shadow-focus">
          <span className="truncate">{file.name}</span>
          <Download aria-hidden className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="truncate">{file.name}</span>
      )}
      <span className="shrink-0 text-fg-muted">{formatBytes(file.size)}</span>
      {scanning ? <span className="shrink-0 text-fg-muted">Em verificação</span> : null}
      {blocked ? <span className="shrink-0 text-danger">Bloqueado</span> : null}
    </span>
  );
}
