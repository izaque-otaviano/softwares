import { Bot, Globe, Mail, MessagesSquare, Paperclip, Webhook } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/cn';
import { absoluteTime, relativeTime } from '@/lib/time';
import type { Attachment, Comment, User } from '@/types/domain';
import { sanitizeHtml } from './sanitizeHtml';

const CHANNEL: Record<Comment['channel'], { label: string; Icon: typeof Mail }> = {
  email: { label: 'E-mail', Icon: Mail },
  web_form: { label: 'Formulário web', Icon: Globe },
  api: { label: 'API', Icon: Webhook },
  chat: { label: 'Chat', Icon: MessagesSquare },
  system: { label: 'Sistema', Icon: Bot },
};

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function AttachmentChip({ file, onRemove }: { file: Attachment; onRemove?: () => void }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1 rounded border border-line bg-surface px-2 text-xs text-fg">
      <Paperclip aria-hidden className="h-3 w-3 shrink-0 text-fg-muted" />
      {file.url && file.downloadable !== false ? (
        <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate text-action hover:underline">
          {file.name}
        </a>
      ) : (
        <span className="truncate" title={file.url ? 'Em verificação: o download ainda não está liberado.' : undefined}>
          {file.name}
        </span>
      )}
      <span className="shrink-0 text-fg-muted">{formatSize(file.size)}</span>
      {onRemove ? (
        <button type="button" aria-label={`Remover ${file.name}`} onClick={onRemove} className="ml-1 rounded-xs px-1 text-fg-muted outline-none hover:bg-hover focus-visible:shadow-focus">
          ×
        </button>
      ) : null}
    </span>
  );
}

export interface MessageBubbleProps {
  comment: Comment;
  author?: User;
  isCustomer: boolean;
  now: Date;
  compact?: boolean;
}

export function MessageBubble({ comment, author, isCustomer, now, compact }: MessageBubbleProps) {
  const name = author?.name ?? comment.authorName ?? 'Usuário';
  const { label, Icon } = CHANNEL[comment.channel];
  const internal = !comment.public;
  return (
    <article
      aria-label={`${internal ? 'Observação interna' : 'Mensagem'} de ${name}`}
      data-testid="message"
      data-kind={internal ? 'internal' : 'public'}
      className="flex gap-3"
    >
      <Avatar name={name} size={40} decorative />
      <div
        className={cn(
          'min-w-0 flex-1 rounded border px-4 py-3',
          internal ? 'border-note-badge bg-note-bg' : isCustomer ? 'border-transparent bg-bubble-customer' : 'border-line bg-surface-1',
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold text-fg">{name}</span>
          {internal ? <span className="rounded-xs bg-note-badge px-1.5 py-0.5 text-2xs font-semibold text-note-badgeText">Interno</span> : null}
          <span title={label} className="inline-flex text-fg-muted">
            <Icon aria-label={`Canal: ${label}`} role="img" className="h-3.5 w-3.5" />
          </span>
          <time dateTime={comment.createdAt} title={absoluteTime(comment.createdAt, now)} className="text-xs text-fg-muted">
            {relativeTime(comment.createdAt, now)}
          </time>
        </div>
        <div
          className={cn(
            'break-words text-sm text-fg [&_a]:text-action [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_code]:rounded-xs [&_code]:bg-surface-2 [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-surface-2 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5',
            compact && 'line-clamp-3',
          )}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.bodyHtml) }}
        />
        {comment.attachments.length > 0 ? (
          <ul aria-label="Anexos" className="mt-2 flex flex-wrap gap-2">
            {comment.attachments.map((f) => (
              <li key={`${f.url ?? ''}${f.name}`} className="max-w-full">
                <AttachmentChip file={f} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
