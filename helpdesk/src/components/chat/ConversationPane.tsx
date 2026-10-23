import { ArrowLeftRight, Download, ExternalLink, Info, List, LogIn, LogOut, RotateCcw, Ticket, UserCheck, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as chatApi from '@/api/chat';
import { openTicket, openUser } from '@/components/shell/openTab';
import { Avatar, Banner, Button, ConfirmModal, EmptyState, IconButton, Kebab, Pill, Skeleton, SkeletonText, type MenuItemSpec } from '@/components/ui';
import { absoluteTime, relativeTime } from '@/lib/time';
import { isParticipating, useChatStore } from '@/store/chat';
import { useSession } from '@/store/useSession';
import { toast } from '@/store/useUi';
import type { ChatMessage } from '@/types/chat';
import { CloseModal, ConvertModal, ExportNotesConfirm, ReopenModal, TransferModal } from './ChatActionModals';
import { ChatComposer } from './ChatComposer';
import { queueLabel, saveBlob, STATUS_LABEL } from './chatUtils';
import { MessageList } from './MessageList';
import { useChatLookups } from './useChatLookups';

export interface ConversationPaneProps {
  /** Botões extras do cabeçalho (voltar à lista, abrir dados do cliente) nas telas estreitas. */
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Depois de pegar da fila, a tela vai para "Minhas". */
  onTaken?: () => void;
}

/** Coluna 2: cabeçalho com ações, mensagens e compositor. */
export function ConversationPane({ leading, trailing, onTaken }: ConversationPaneProps) {
  const conv = useChatStore((s) => s.conversation);
  const reload = useChatStore((s) => s.reloadConversation);
  const store = useChatStore;
  const lookups = useChatLookups();
  const user = useSession((s) => s.user);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [modal, setModal] = useState<'transfer' | 'close' | 'convert' | 'reopen' | 'export-notes' | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const chatId = conv?.chatId ?? null;
  useEffect(() => {
    setReplyTo(null);
    setModal(null);
  }, [chatId]);
  useEffect(() => {
    void lookups.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chat = conv?.chat ?? null;
  const meId = user?.id ?? null;
  const isAdmin = user?.role === 'admin';
  const isOwner = Boolean(chat && meId && chat.agentId === meId);
  const participant = Boolean(chat && meId && chat.participants.some((p) => p.id === meId));
  const canWrite = Boolean(chat && chat.status === 'active' && isParticipating(chat));
  const canTransfer = Boolean(chat && chat.status === 'active' && (isOwner || isAdmin));
  const canConvert = Boolean(chat && !chat.ticketId && chat.status !== 'queued' && (isOwner || isAdmin));
  const canClose = Boolean(chat && chat.status === 'active' && (isOwner || participant || chat.canSupervise));
  const canReopen = Boolean(chat && chat.status === 'closed' && !chat.ticketId);

  const doExport = async (withNotes: boolean) => {
    if (!chat) return;
    try {
      const { blob, fileName } = await chatApi.exportChat(chat.id, withNotes);
      saveBlob(blob, fileName);
      toast.success('Conversa exportada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível exportar a conversa.');
      throw e;
    }
  };

  const menu = useMemo<MenuItemSpec[]>(() => {
    if (!chat) return [];
    const items: MenuItemSpec[] = [];
    if (canConvert) items.push({ id: 'convert', label: 'Converter em ticket', icon: <Ticket aria-hidden className="h-4 w-4" />, onSelect: () => setModal('convert') });
    if (chat.status === 'active' && chat.canSupervise && !isOwner) {
      if (!participant) items.push({ id: 'join', label: 'Entrar na conversa', icon: <LogIn aria-hidden className="h-4 w-4" />, onSelect: () => void store.getState().join() });
      items.push({ id: 'assume', label: 'Assumir atendimento', icon: <UserCheck aria-hidden className="h-4 w-4" />, onSelect: () => void store.getState().assume() });
    }
    if (participant) items.push({ id: 'leave', label: 'Sair da conversa', icon: <LogOut aria-hidden className="h-4 w-4" />, onSelect: () => void store.getState().leave() });
    items.push({ id: 'export', label: 'Exportar PDF', icon: <Download aria-hidden className="h-4 w-4" />, separatorBefore: items.length > 0, onSelect: () => void doExport(false).catch(() => undefined) });
    items.push({ id: 'export-notes', label: 'Exportar PDF com notas internas', icon: <Download aria-hidden className="h-4 w-4" />, onSelect: () => setModal('export-notes') });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, canConvert, isOwner, participant]);

  if (!conv) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {leading || trailing ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
            <div>{leading}</div>
            <div>{trailing}</div>
          </div>
        ) : null}
        <EmptyState illustration="box" title="Selecione uma conversa" description="Escolha uma conversa da lista para ver as mensagens e atender o cliente." />
      </div>
    );
  }

  if (conv.loading && !chat) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          {leading}
          <Skeleton circle width={36} height={36} />
          <SkeletonText lines={2} className="w-48" label="Carregando conversa" />
        </div>
        <div className="flex-1 space-y-3 p-4">
          <SkeletonText lines={3} className="max-w-md" />
          <SkeletonText lines={2} className="ml-auto max-w-sm" />
        </div>
      </div>
    );
  }

  if (conv.error && !chat) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {leading || trailing ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
            <div>{leading}</div>
            <div>{trailing}</div>
          </div>
        ) : null}
        <div className="p-4">
          <Banner tone="error" title="Não foi possível abrir a conversa" onRetry={() => void reload()} retryLabel="Tentar novamente">
            {conv.error}
          </Banner>
        </div>
      </div>
    );
  }
  if (!chat) return null;

  const now = new Date();
  const queue = queueLabel(chat);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="conversation">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
        {leading}
        <Avatar name={chat.clientName} src={chat.clientAvatar ?? undefined} size={36} decorative presence={chat.clientPresence ?? undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 truncate text-md font-semibold text-fg">
              <button type="button" onClick={() => openUser(chat.clientId, chat.clientName)} className="rounded-xs text-left outline-none hover:underline focus-visible:shadow-focus" title="Abrir o cliente em uma aba">
                {chat.clientName}
              </button>
            </h2>
            <Pill tone={chat.status === 'queued' ? 'note' : chat.status === 'active' ? 'action' : 'neutral'}>{STATUS_LABEL[chat.status]}</Pill>
            <span className="text-xs text-fg-muted">#{chat.id}</span>
          </div>
          <p className="truncate text-xs text-fg-muted">
            {[chat.companyName, chat.name ? `"${chat.name}"` : '', chat.agentName ? `Atendimento: ${chat.agentName}` : '', chat.participants.length ? `Também na conversa: ${chat.participants.map((p) => p.name).join(', ')}` : ''].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chat.status === 'queued' ? (
            <Button
              variant="primary"
              leadingIcon={<UserCheck aria-hidden className="h-4 w-4" />}
              loading={conv.busy}
              onClick={async () => {
                if (await store.getState().take()) onTaken?.();
              }}
            >
              Pegar da fila
            </Button>
          ) : null}
          {chat.status === 'active' && chat.canSupervise && !isOwner && !participant ? (
            <Button variant="outline" leadingIcon={<LogIn aria-hidden className="h-4 w-4" />} loading={conv.busy} onClick={() => void store.getState().join()}>
              Entrar na conversa
            </Button>
          ) : null}
          {canTransfer ? (
            <Button variant="outline" leadingIcon={<ArrowLeftRight aria-hidden className="h-4 w-4" />} disabled={conv.busy} onClick={() => setModal('transfer')}>
              Transferir
            </Button>
          ) : null}
          {canClose ? (
            <Button variant="outline" leadingIcon={<XCircle aria-hidden className="h-4 w-4" />} disabled={conv.busy} onClick={() => setModal('close')}>
              Encerrar
            </Button>
          ) : null}
          {canReopen ? (
            <Button variant="outline" leadingIcon={<RotateCcw aria-hidden className="h-4 w-4" />} disabled={conv.busy} onClick={() => setModal('reopen')}>
              Reabrir
            </Button>
          ) : null}
          <Kebab items={menu} label="Mais ações da conversa" />
          {trailing}
        </div>
      </header>

      <div className="shrink-0 space-y-2 px-4 pt-2 empty:hidden">
        {!conv.connected && chat.status !== 'closed' ? (
          <p role="status" className="text-xs text-fg-muted">
            Sem conexão em tempo real. Tentando reconectar; as mensagens novas aparecem quando a conexão voltar.
          </p>
        ) : null}
        {chat.status === 'queued' ? (
          <Banner tone={chat.queue && !chat.queue.queueOpen ? 'warning' : 'info'} title={queue ?? 'Aguardando atendimento'}>
            {chat.queue && !chat.queue.queueOpen
              ? `A fila está fechada${chat.queue.queueOpensAt ? `; abre ${absoluteTime(chat.queue.queueOpensAt, now)}` : ''}. O cliente espera desde ${relativeTime(chat.queuedAt, now)}.`
              : `O cliente espera desde ${relativeTime(chat.queuedAt, now)}. Pegue a conversa para responder.`}
          </Banner>
        ) : null}
        {chat.status === 'active' && !canWrite ? (
          <Banner tone="info" title={`Conversa de ${chat.agentName ?? 'outro agente'}`}>
            {chat.canSupervise ? 'Você acompanha sem interferir. Entre na conversa para escrever junto ou assuma o atendimento.' : 'Você pode acompanhar, mas só quem atende responde. Peça uma transferência a quem está com a conversa.'}
          </Banner>
        ) : null}
        {chat.status === 'closed' ? (
          <Banner tone="info" title={`Conversa encerrada${chat.closedAt ? ` ${absoluteTime(chat.closedAt, now)}` : ''}`}>
            {[
              chat.closedByName ? `Por ${chat.closedByName}.` : chat.closedAutomatically ? 'Encerrada automaticamente.' : '',
              chat.closeReasonName ? `Motivo: ${chat.closeReasonName}.` : '',
              chat.closeNote ? `Observação interna: ${chat.closeNote}` : '',
            ]
              .filter(Boolean)
              .join(' ')}
          </Banner>
        ) : null}
        {chat.rating ? (
          <Banner tone="success" title={`Avaliação do cliente: atendimento ${chat.rating.serviceScore}, resolução ${chat.rating.resolutionScore}`}>
            {chat.rating.justification || 'Sem justificativa.'}
          </Banner>
        ) : chat.status === 'closed' && chat.ratingPending ? (
          <p className="text-xs text-fg-muted">O cliente ainda não avaliou este atendimento.</p>
        ) : null}
        {chat.ticketId ? (
          <Banner tone="success" title={`Convertida no ticket ${chat.ticketReference ?? `#${chat.ticketId}`}`}>
            <Button variant="outline" leadingIcon={<ExternalLink aria-hidden className="h-4 w-4" />} onClick={() => openTicket(chat.ticketId!, { requesterName: chat.clientName })}>
              Abrir o ticket
            </Button>
          </Banner>
        ) : null}
      </div>

      {conv.error ? (
        <div className="px-4 pt-2">
          <Banner tone="error" title="Não foi possível carregar as mensagens" onRetry={() => void reload()} retryLabel="Tentar novamente">
            {conv.error}
          </Banner>
        </div>
      ) : null}

      {conv.loading ? (
        <div className="flex-1 p-4" aria-busy="true">
          <SkeletonText lines={4} label="Carregando mensagens" />
        </div>
      ) : conv.messages.length === 0 && conv.pending.length === 0 ? (
        <EmptyState compact illustration="box" title="Nenhuma mensagem ainda" description="As mensagens da conversa aparecem aqui." />
      ) : (
        <MessageList
          resetKey={conv.chatId}
          messages={conv.messages}
          pending={conv.pending}
          hasMore={conv.hasMore}
          loadingMore={conv.loadingMore}
          onLoadOlder={() => void store.getState().loadOlder()}
          typingName={conv.typingName}
          canWrite={canWrite}
          onReply={setReplyTo}
          onEdit={(id, body) => store.getState().editMessage(id, body)}
          onDelete={(id) => setDeleting(id)}
          onRetry={(id) => store.getState().retryPending(id)}
          onDiscard={(id) => store.getState().discardPending(id)}
        />
      )}

      {canWrite ? (
        <ChatComposer
          key={chat.id}
          chat={chat}
          initialDraft={store.getState().drafts[chat.id] ?? ''}
          onDraftChange={(t) => store.getState().setDraft(chat.id, t)}
          quickReplies={lookups.quickReplies}
          macros={lookups.macros}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onSendText={(body, opts) => store.getState().sendText(body, opts)}
          onSendFiles={(input) => store.getState().sendFiles(input)}
          onTyping={(t) => store.getState().sendTyping(t)}
          onApplyMacro={(id) => void store.getState().applyMacro(id)}
          connected={conv.connected}
        />
      ) : (
        <div className="shrink-0 border-t border-line px-4 py-3 text-sm text-fg-muted">
          {chat.status === 'queued' ? 'Pegue a conversa da fila para responder.' : chat.status === 'closed' ? 'Conversa encerrada. Reabra para voltar a responder.' : 'Você não está atendendo esta conversa.'}
        </div>
      )}

      <TransferModal open={modal === 'transfer'} onOpenChange={(o) => setModal(o ? 'transfer' : null)} chat={chat} agents={lookups.agents} meId={meId} onConfirm={(id, note) => store.getState().transfer(id, note)} />
      <CloseModal open={modal === 'close'} onOpenChange={(o) => setModal(o ? 'close' : null)} chat={chat} reasons={lookups.reasons} config={lookups.config} onConfirm={(input) => store.getState().close(input)} />
      <ConvertModal open={modal === 'convert'} onOpenChange={(o) => setModal(o ? 'convert' : null)} chat={chat} teams={lookups.teams} defaultTeamId={lookups.config?.defaultTeamId ?? null} onConfirm={(teamId) => store.getState().convert(teamId)} />
      <ReopenModal open={modal === 'reopen'} onOpenChange={(o) => setModal(o ? 'reopen' : null)} chat={chat} onConfirm={(note) => store.getState().reopen(note)} />
      <ExportNotesConfirm open={modal === 'export-notes'} onOpenChange={(o) => setModal(o ? 'export-notes' : null)} onConfirm={() => doExport(true)} />
      <DeleteMessageConfirm id={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function DeleteMessageConfirm({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <ConfirmModal
      open={id !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Apagar mensagem?"
      description="A mensagem deixa de aparecer para o cliente e para a equipe; no lugar fica o aviso de que foi apagada. Só a sua última mensagem pode ser apagada."
      confirmLabel="Apagar mensagem"
      onConfirm={async () => {
        if (id) await useChatStore.getState().deleteMessage(id);
      }}
    />
  );
}

/** Botões das telas estreitas: lista de conversas e dados do cliente (as colunas viram gavetas). */
export function NarrowButtons({ onList, onClient }: { onList?: () => void; onClient?: () => void }) {
  return (
    <>
      {onList ? <IconButton label="Abrir lista de conversas" icon={<List aria-hidden className="h-4 w-4" />} onClick={onList} /> : null}
      {onClient ? <IconButton label="Ver dados do cliente" icon={<Info aria-hidden className="h-4 w-4" />} onClick={onClient} /> : null}
    </>
  );
}
