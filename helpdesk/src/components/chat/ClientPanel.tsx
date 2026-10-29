import { Building2, ExternalLink, Link2, Mail, Paperclip, Phone } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import * as chatApi from '@/api/chat';
import { orgsApi, ticketsApi, usersApi } from '@/api';
import { openOrg, openTicket, openUser } from '@/components/shell/openTab';
import { Avatar, Banner, Button, Field, Input, Pill, SkeletonText, PRESENCE_LABEL, StatusBadge } from '@/components/ui';
import { DEFAULT_STATUSES } from '@/lib/status';
import { absoluteTime, relativeTime } from '@/lib/time';
import { isParticipating, useChatStore } from '@/store/chat';
import { useTickets } from '@/store/useTickets';
import type { Chat } from '@/types/chat';
import { PRIORITY_LABEL, STATUS_LABEL } from './chatUtils';
import { useLoad } from './useLoad';

/** Coluna 3: dados do cliente, da empresa, do atendimento, histórico de chats e de tickets, anexos e links. */
export function ClientPanel({ chat, onOpenChat }: { chat: Chat | null; onOpenChat: (id: string) => void }) {
  if (!chat) {
    return (
      <aside aria-label="Dados do cliente" className="flex min-h-0 flex-1 flex-col p-4 text-sm text-fg-muted">
        Selecione uma conversa para ver os dados do cliente.
      </aside>
    );
  }
  return (
    <aside aria-label="Dados do cliente" className="min-h-0 flex-1 overflow-y-auto" data-testid="client-panel">
      <ProfileSection chat={chat} />
      <ServiceSection chat={chat} />
      <HistorySection chat={chat} onOpenChat={onOpenChat} />
      <TicketsSection chat={chat} />
      <MediaSection chat={chat} />
    </aside>
  );
}

function Section({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section aria-label={title} className="border-b border-line px-4 py-3">
      <h3 className="mb-2 text-sm font-semibold text-fg">
        {title}
        {count !== undefined ? <span className="ml-1 font-normal text-fg-muted">({count})</span> : null}
      </h3>
      {children}
    </section>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Banner tone="error" onRetry={onRetry} retryLabel="Tentar novamente">
      {message}
    </Banner>
  );
}

function ProfileSection({ chat }: { chat: Chat }) {
  const user = useLoad(chat.clientId, () => usersApi.getUser(chat.clientId).catch(() => null));
  const org = useLoad(user.data?.orgId ?? null, () => orgsApi.getOrg(user.data!.orgId!).catch(() => null));
  const u = user.data;
  return (
    <section aria-label="Cliente" className="border-b border-line px-4 py-4">
      <div className="flex items-center gap-3">
        <Avatar name={chat.clientName} src={chat.clientAvatar ?? undefined} size={48} decorative presence={chat.clientPresence ?? undefined} />
        <div className="min-w-0">
          <h3 className="truncate text-md font-semibold text-fg">{chat.clientName}</h3>
          <p className="text-xs text-fg-muted">{chat.clientPresence === 'available' ? 'Online agora' : PRESENCE_LABEL[chat.clientPresence ?? 'offline']}</p>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {chat.clientEmail ? (
          <div className="flex items-center gap-2">
            <Mail aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
            <dt className="sr-only">E-mail</dt>
            <dd className="min-w-0 truncate">
              <a href={`mailto:${chat.clientEmail}`} className="text-action hover:underline">
                {chat.clientEmail}
              </a>
            </dd>
          </div>
        ) : null}
        {(chat.clientPhone || u?.phone) ? (
          <div className="flex items-center gap-2">
            <Phone aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
            <dt className="sr-only">Telefone</dt>
            <dd>{chat.clientPhone || u?.phone}</dd>
          </div>
        ) : null}
        {chat.companyName ? (
          <div className="flex items-center gap-2">
            <Building2 aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
            <dt className="sr-only">Empresa</dt>
            <dd className="min-w-0 truncate">{chat.companyName}</dd>
          </div>
        ) : null}
      </dl>
      {user.loading ? <SkeletonText lines={2} className="mt-3" label="Carregando dados do cliente" /> : null}
      {u?.details ? <p className="mt-3 text-sm text-fg">{u.details}</p> : null}
      {u?.tags.length ? (
        <p className="mt-2 flex flex-wrap gap-1">
          {u.tags.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </p>
      ) : null}
      {u?.notes ? <p className="mt-2 rounded bg-note-bg px-2 py-1.5 text-xs text-note-badgeText">{u.notes}</p> : null}
      {org.data ? (
        <div className="mt-3 rounded border border-line bg-surface-1 px-3 py-2 text-sm">
          <p className="font-semibold text-fg">{org.data.name}</p>
          {org.data.planName ? <p className="text-xs text-fg-muted">Plano {org.data.planName}</p> : null}
          {org.data.details ? <p className="mt-1 text-xs text-fg-muted">{org.data.details}</p> : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" leadingIcon={<ExternalLink aria-hidden className="h-4 w-4" />} onClick={() => openUser(chat.clientId, chat.clientName)}>
          Abrir cliente
        </Button>
        {u?.orgId ? (
          <Button variant="outline" leadingIcon={<Building2 aria-hidden className="h-4 w-4" />} onClick={() => openOrg(u.orgId!, org.data?.name ?? chat.companyName)}>
            Abrir empresa
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function ServiceSection({ chat }: { chat: Chat }) {
  const updateChat = useChatStore((s) => s.updateChat);
  const canEdit = chat.status === 'active' && isParticipating(chat) && chat.agentId !== null;
  const [name, setName] = useState(chat.name);
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(chat.name), [chat.id, chat.name]);
  return (
    <Section title="Atendimento">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-muted">Protocolo</dt>
        <dd>#{chat.id}</dd>
        <dt className="text-fg-muted">Status</dt>
        <dd>{STATUS_LABEL[chat.status]}</dd>
        <dt className="text-fg-muted">Na fila desde</dt>
        <dd>{absoluteTime(chat.queuedAt)}</dd>
        {chat.acceptedAt ? (
          <>
            <dt className="text-fg-muted">Atendida em</dt>
            <dd>{absoluteTime(chat.acceptedAt)}</dd>
          </>
        ) : null}
        {chat.agentName ? (
          <>
            <dt className="text-fg-muted">Agente</dt>
            <dd>{chat.agentName}</dd>
          </>
        ) : null}
        <dt className="text-fg-muted">Urgência</dt>
        <dd>{PRIORITY_LABEL[chat.priority]}</dd>
        {chat.categoryName ? (
          <>
            <dt className="text-fg-muted">Assunto</dt>
            <dd>{chat.categoryName}</dd>
          </>
        ) : null}
        {chat.reopenCount > 0 ? (
          <>
            <dt className="text-fg-muted">Reaberturas</dt>
            <dd>{chat.reopenCount}</dd>
          </>
        ) : null}
        {chat.agentScore !== null ? (
          <>
            <dt className="text-fg-muted">Sua nota interna</dt>
            <dd>{chat.agentScore}</dd>
          </>
        ) : null}
      </dl>
      {canEdit ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await updateChat({ name: name.trim() });
            } finally {
              setSaving(false);
            }
          }}
        >
          <Field label="Nome interno" hint="Só a equipe vê. Vira o assunto do ticket se a conversa for convertida.">
            <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline" loading={saving} disabled={name.trim() === chat.name}>
            Salvar nome
          </Button>
        </form>
      ) : chat.name ? (
        <p className="mt-2 text-sm text-fg">
          <span className="text-fg-muted">Nome interno: </span>
          {chat.name}
        </p>
      ) : null}
    </Section>
  );
}

function HistorySection({ chat, onOpenChat }: { chat: Chat; onOpenChat: (id: string) => void }) {
  const history = useLoad(chat.clientId, () => chatApi.listChats({ scope: 'all', clientId: chat.clientId, limit: 20 }));
  const others = (history.data?.results ?? []).filter((c) => c.id !== chat.id);
  return (
    <Section title="Histórico de chats" count={history.data ? others.length : undefined}>
      {history.loading ? <SkeletonText lines={2} label="Carregando histórico de chats" /> : null}
      {history.error ? <SectionError message={history.error} onRetry={history.reload} /> : null}
      {history.data && others.length === 0 ? <p className="text-sm text-fg-muted">Este é o primeiro chat do cliente.</p> : null}
      {others.length > 0 ? (
        <ul className="divide-y divide-line">
          {others.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onOpenChat(c.id)} className="flex w-full flex-col items-start rounded-xs py-1.5 text-left outline-none hover:bg-hover focus-visible:shadow-focus">
                <span className="flex w-full items-center gap-2 text-sm">
                  <span className="font-semibold text-action">#{c.id}</span>
                  <span className="text-xs text-fg-muted">{STATUS_LABEL[c.status]}</span>
                  <span className="ml-auto shrink-0 text-xs text-fg-muted">{relativeTime(c.closedAt ?? c.queuedAt)}</span>
                </span>
                <span className="w-full truncate text-xs text-fg-muted">{c.lastMessagePreview ?? 'Sem mensagens'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function TicketsSection({ chat }: { chat: Chat }) {
  const tickets = useLoad(chat.clientId, () => ticketsApi.listTickets({ requesterId: chat.clientId }));
  const storeStatuses = useTickets((s) => s.statuses);
  const statuses = storeStatuses.length ? storeStatuses : DEFAULT_STATUSES;
  const rows = [...(tickets.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  return (
    <Section title="Tickets do cliente" count={tickets.data?.length}>
      {tickets.loading ? <SkeletonText lines={2} label="Carregando tickets" /> : null}
      {tickets.error ? <SectionError message={tickets.error} onRetry={tickets.reload} /> : null}
      {tickets.data && rows.length === 0 ? <p className="text-sm text-fg-muted">O cliente não tem tickets.</p> : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-line">
          {rows.map((t) => {
            const status = statuses.find((s) => s.id === t.statusId);
            return (
              <li key={t.id}>
                <button type="button" onClick={() => openTicket(t.id, { title: t.subject, requesterName: chat.clientName, channel: t.channel })} title="Abrir o ticket em uma aba" className="flex w-full flex-col items-start gap-0.5 rounded-xs py-1.5 text-left outline-none hover:bg-hover focus-visible:shadow-focus">
                  <span className="flex w-full items-center gap-2">
                    <span className="text-sm font-semibold text-action">#{t.id}</span>
                    {status ? <StatusBadge status={status} label={status.agentName} /> : null}
                    <ExternalLink aria-hidden className="ml-auto h-3 w-3 shrink-0 text-fg-muted" />
                  </span>
                  <span className="w-full truncate text-xs text-fg">{t.subject}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Section>
  );
}

function MediaSection({ chat }: { chat: Chat }) {
  const media = useLoad(`${chat.id}:${chat.lastMessagePreview ?? ''}`, () => chatApi.getChatMedia(chat.id));
  const files = media.data?.files ?? [];
  const links = media.data?.links ?? [];
  return (
    <Section title="Anexos e links" count={media.data ? files.length + links.length : undefined}>
      {media.loading && !media.data ? <SkeletonText lines={2} label="Carregando anexos" /> : null}
      {media.error ? <SectionError message={media.error} onRetry={media.reload} /> : null}
      {media.data && files.length + links.length === 0 ? <p className="text-sm text-fg-muted">Nenhum anexo ou link nesta conversa.</p> : null}
      {files.length > 0 ? (
        <ul aria-label="Arquivos da conversa" className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <Paperclip aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
              {f.downloadable ? (
                <a href={f.url} download={f.name} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-action hover:underline">
                  {f.name}
                </a>
              ) : (
                <span className="min-w-0 truncate">{f.name}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {links.length > 0 ? (
        <ul aria-label="Links da conversa" className="mt-2 space-y-1">
          {links.map((l) => (
            <li key={l.url} className="flex items-center gap-2 text-sm">
              <Link2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-action hover:underline">
                {l.url}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
