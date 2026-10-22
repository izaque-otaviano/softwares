import { Ban, EllipsisVertical, Filter, History, Mail, Globe, Frown, Meh, Smile, Printer, Rows3, Trash2, UserX, Merge, Zap } from 'lucide-react';
import { useState } from 'react';
import {
  ConfirmModal,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuItems,
  MenuTrigger,
  SlaPill,
  type MenuItemSpec,
} from '@/components/ui';
import { toast } from '@/store/useUi';
import type { Ticket } from '@/types/domain';

export type ConversationFilter = 'all' | 'public' | 'internal';

export const FILTER_LABEL: Record<ConversationFilter, string> = {
  all: 'Tudo',
  public: 'Mensagens públicas',
  internal: 'Observações internas',
};

const SENTIMENT_ICON = { Positivo: Smile, Neutro: Meh, Negativo: Frown } as const;

type Danger = 'suspend' | 'spam' | 'delete';
const DANGER_COPY: Record<Danger, { title: string; description: string; confirm: string; done: string }> = {
  suspend: { title: 'Suspender usuário', description: 'O solicitante não poderá mais abrir tickets. Você pode reativá-lo depois.', confirm: 'Suspender usuário', done: 'Usuário suspenso' },
  spam: { title: 'Marcar como spam', description: 'O ticket será movido para spam e o solicitante poderá ser bloqueado.', confirm: 'Marcar como spam', done: 'Ticket marcado como spam' },
  delete: { title: 'Apagar ticket', description: 'O ticket será apagado. Essa ação não pode ser desfeita.', confirm: 'Apagar', done: 'Ticket apagado' },
};

export interface ConversationHeaderProps {
  ticket: Ticket;
  filter: ConversationFilter;
  onFilterChange: (f: ConversationFilter) => void;
  showEvents: boolean;
  onToggleEvents: () => void;
  compact: boolean;
  onToggleCompact: () => void;
}

export function ConversationHeader({ ticket, filter, onFilterChange, showEvents, onToggleEvents, compact, onToggleCompact }: ConversationHeaderProps) {
  const [danger, setDanger] = useState<Danger | null>(null);
  const topic = ticket.customFields.topico;
  const sentiment = ticket.customFields.sentimento as keyof typeof SENTIMENT_ICON | undefined;
  const SentimentIcon = sentiment ? SENTIMENT_ICON[sentiment] : undefined;
  const ChannelIcon = ticket.channel === 'email' ? Mail : Globe;

  const items: MenuItemSpec[] = [
    { id: 'macro', label: 'Criar como macro', icon: <Zap />, onSelect: () => toast.info('Macro criada a partir do ticket (simulado)') },
    { id: 'merge', label: 'Fundir em outro ticket', icon: <Merge />, onSelect: () => toast.info('Escolha o ticket de destino em Sugestões de fusão') },
    {
      id: 'print',
      label: 'Imprimir ticket',
      icon: <Printer />,
      onSelect: () => {
        try {
          window.print();
        } catch {
          /* sem suporte */
        }
      },
    },
    { id: 'suspend', label: 'Suspender usuário', icon: <UserX />, tone: 'danger', onSelect: () => setDanger('suspend') },
    { id: 'spam', label: 'Marcar como spam', icon: <Ban />, tone: 'danger', onSelect: () => setDanger('spam') },
    { id: 'delete', label: 'Apagar', icon: <Trash2 />, tone: 'danger', onSelect: () => setDanger('delete') },
  ];
  const copy = danger ? DANGER_COPY[danger] : null;

  return (
    <header className="shrink-0 px-6 pb-2 pt-4">
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 flex-1 text-md font-semibold text-fg">{ticket.subject}</h1>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Alternar visão compacta" icon={<Rows3 />} pressed={compact} onClick={onToggleCompact} />
          <Menu>
            <MenuTrigger asChild>
              <IconButton label="Filtrar conversa" icon={<Filter />} pressed={filter !== 'all'} />
            </MenuTrigger>
            <MenuContent align="end">
              {(Object.keys(FILTER_LABEL) as ConversationFilter[]).map((f) => (
                <MenuItem key={f} checked={filter === f} onSelect={() => onFilterChange(f)}>
                  {FILTER_LABEL[f]}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <IconButton label="Histórico de eventos" icon={<History />} pressed={showEvents} onClick={onToggleEvents} />
          <Menu>
            <MenuTrigger asChild>
              <IconButton label="Mais ações do ticket" icon={<EllipsisVertical />} />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItems items={items} />
            </MenuContent>
          </Menu>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        {ticket.sla ? <SlaPill dueAt={ticket.sla.dueAt} state={ticket.sla.state} target={ticket.sla.target} /> : null}
        <span className="inline-flex items-center gap-1">
          <ChannelIcon aria-hidden className="h-3.5 w-3.5" />
          {ticket.channel === 'email' ? 'Pelo e-mail' : 'Pelo formulário web'}
        </span>
        {topic ? <span className="text-action">Tópico {topic}</span> : null}
        {sentiment && SentimentIcon ? (
          <span className="inline-flex items-center gap-1">
            <SentimentIcon aria-hidden className="h-3.5 w-3.5" />
            {sentiment}
          </span>
        ) : null}
      </div>
      {copy ? (
        <ConfirmModal
          open
          onOpenChange={(o) => !o && setDanger(null)}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirm}
          onConfirm={() => {
            toast.success(copy.done);
            setDanger(null);
          }}
        />
      ) : null}
    </header>
  );
}
