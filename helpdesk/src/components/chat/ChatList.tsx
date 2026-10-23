import { Clock, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar, Banner, Button, EmptyState, Input, Pill, Select, SkeletonRows, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/time';
import { useChatStore } from '@/store/chat';
import type { Chat, ChatListScope, ChatStatus } from '@/types/chat';
import { queueLabel, STATUS_LABEL, waitLabel } from './chatUtils';

const SCOPES: { id: ChatListScope; label: string }[] = [
  { id: 'queue', label: 'Fila' },
  { id: 'mine', label: 'Minhas' },
  { id: 'all', label: 'Todas' },
];

const EMPTY: Record<ChatListScope, { title: string; description: string }> = {
  queue: { title: 'Fila vazia', description: 'Nenhum cliente está esperando atendimento agora. Novos chats aparecem aqui assim que chegarem.' },
  mine: { title: 'Você não tem conversas em atendimento', description: 'Pegue um chat da fila para começar a conversar.' },
  all: { title: 'Nenhuma conversa encontrada', description: 'Ajuste a busca ou o filtro para ver outras conversas.' },
};

export interface ChatListProps {
  selectedId: string | null;
  onSelect: (chat: Chat) => void;
  className?: string;
}

/** Coluna 1: abas Fila / Minhas / Todas com contadores, busca e a lista de conversas. */
export function ChatList({ selectedId, onSelect, className }: ChatListProps) {
  const scope = useChatStore((s) => s.scope);
  const counts = useChatStore((s) => s.counts);
  const query = useChatStore((s) => s.query);
  const statusFilter = useChatStore((s) => s.statusFilter);
  const setScope = useChatStore((s) => s.setScope);
  const setQuery = useChatStore((s) => s.setQuery);
  const setStatusFilter = useChatStore((s) => s.setStatusFilter);
  const [text, setText] = useState(query);

  // A busca vai ao servidor (cliente, empresa, protocolo e conteúdo das mensagens): espera a digitação parar.
  useEffect(() => {
    if (text === query) return;
    const t = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text, query, setQuery]);

  return (
    <section aria-label="Conversas" className={cn('flex min-h-0 flex-col bg-surface', className)}>
      <div className="shrink-0 px-3 pt-3">
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buscar por cliente, empresa, #protocolo ou texto"
          aria-label="Buscar conversas"
          leadingIcon={<Search aria-hidden className="h-4 w-4" />}
          trailingSlot={
            text ? (
              <button type="button" aria-label="Limpar busca" onClick={() => setText('')} className="rounded-xs p-0.5 text-fg-muted outline-none hover:bg-hover focus-visible:shadow-focus">
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            ) : undefined
          }
        />
      </div>
      <Tabs value={scope} onValueChange={(v) => setScope(v as ChatListScope)} className="mt-1 min-h-0 flex-1">
        <TabsList aria-label="Filtrar conversas" className="shrink-0 px-1">
          {SCOPES.map((s) => (
            <TabsTrigger key={s.id} value={s.id} count={counts[s.id]}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SCOPES.map((s) => (
          <TabsContent key={s.id} value={s.id} className="flex min-h-0 flex-1 flex-col outline-none focus-visible:shadow-focus data-[state=inactive]:hidden">
            {s.id === 'all' ? (
              <div className="shrink-0 px-3 pt-2">
                <Select
                  aria-label="Status da conversa"
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as ChatStatus | 'all')}
                  options={[
                    { value: 'all', label: 'Todos os status' },
                    { value: 'queued', label: STATUS_LABEL.queued },
                    { value: 'active', label: STATUS_LABEL.active },
                    { value: 'closed', label: STATUS_LABEL.closed },
                  ]}
                />
              </div>
            ) : null}
            <ChatListBody scope={s.id} selectedId={selectedId} onSelect={onSelect} searching={Boolean(query)} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function ChatListBody({ scope, selectedId, onSelect, searching }: { scope: ChatListScope; selectedId: string | null; onSelect: (c: Chat) => void; searching: boolean }) {
  const list = useChatStore((s) => s.lists[scope]);
  const loadList = useChatStore((s) => s.loadList);
  const loadMore = useChatStore((s) => s.loadMoreList);
  const now = new Date();

  useEffect(() => {
    if (!list.loaded && !list.loading && !list.error) void loadList(scope);
  }, [scope, list.loaded, list.loading, list.error, loadList]);

  if (list.error && list.items.length === 0) {
    return (
      <div className="p-3">
        <Banner tone="error" title="Não foi possível carregar as conversas" onRetry={() => void loadList(scope)} retryLabel="Tentar novamente">
          {list.error}
        </Banner>
      </div>
    );
  }
  if (!list.loaded || (list.loading && list.items.length === 0)) {
    return (
      <div className="p-3">
        <SkeletonRows rows={6} columns={1} label="Carregando conversas" />
      </div>
    );
  }
  if (list.items.length === 0) {
    const e = searching ? { title: 'Nada encontrado', description: 'Nenhuma conversa corresponde à busca. Tente outro termo.' } : EMPTY[scope];
    return <EmptyState illustration="box" compact headingLevel={2} title={e.title} description={e.description} />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {list.error ? (
        <div className="p-3">
          <Banner tone="error" title="Não foi possível atualizar a lista" onRetry={() => void loadList(scope)} retryLabel="Tentar novamente">
            {list.error}
          </Banner>
        </div>
      ) : null}
      <ul aria-label={`Conversas: ${SCOPES.find((s) => s.id === scope)?.label}`} className="divide-y divide-line">
        {list.items.map((chat) => (
          <ChatRow key={chat.id} chat={chat} scope={scope} selected={chat.id === selectedId} onSelect={onSelect} now={now} />
        ))}
      </ul>
      {list.items.length < list.count ? (
        <div className="p-3">
          <Button variant="outline" className="w-full" loading={list.loadingMore} onClick={() => void loadMore()}>
            Carregar mais ({list.count - list.items.length})
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ChatRow({ chat, scope, selected, onSelect, now }: { chat: Chat; scope: ChatListScope; selected: boolean; onSelect: (c: Chat) => void; now: Date }) {
  const queue = queueLabel(chat);
  const unread = chat.unreadCount;
  const when =
    chat.status === 'queued'
      ? { text: waitLabel(chat.queuedAt, now), title: 'Tempo de espera na fila' }
      : chat.status === 'closed' && chat.closedAt
        ? { text: relativeTime(chat.closedAt, now), title: 'Encerrada' }
        : { text: relativeTime(chat.acceptedAt ?? chat.queuedAt, now), title: 'Início do atendimento' };
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(chat)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full gap-3 px-3 py-3 text-left outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus',
          selected && 'bg-action-soft',
        )}
      >
        <Avatar name={chat.clientName} src={chat.clientAvatar ?? undefined} size={36} decorative presence={chat.clientPresence ?? undefined} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', unread > 0 ? 'font-bold text-fg' : 'font-semibold text-fg')}>{chat.clientName}</span>
            <span title={when.title} className="shrink-0 text-xs text-fg-muted">
              {when.text}
            </span>
          </span>
          <span className="block truncate text-xs text-fg-muted">{chat.companyName || chat.clientEmail}</span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-xs', unread > 0 ? 'text-fg' : 'text-fg-muted')}>{chat.lastMessagePreview ?? 'Sem mensagens'}</span>
            {unread > 0 ? (
              <span aria-label={`${unread} ${unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`} className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-action px-1.5 text-2xs font-semibold text-fg-inverse">
                {unread}
              </span>
            ) : null}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {queue ? (
              <Pill tone="note" icon={<Clock aria-hidden className="h-3 w-3" />}>
                {queue}
              </Pill>
            ) : null}
            {scope === 'all' ? <Pill tone={chat.status === 'queued' ? 'note' : chat.status === 'active' ? 'action' : 'neutral'}>{STATUS_LABEL[chat.status]}</Pill> : null}
            {chat.status === 'active' && chat.agentName && scope !== 'mine' ? <span className="truncate text-xs text-fg-muted">com {chat.agentName}</span> : null}
            {chat.ratingPending && chat.status === 'closed' ? <span className="text-xs text-fg-muted">Sem avaliação</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}
