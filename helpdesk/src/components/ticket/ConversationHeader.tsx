import { Ban, EllipsisVertical, Filter, History, Mail, Globe, Frown, Meh, Smile, Printer, Rows3, Trash2, UserX, Merge, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localHint } from '@/api/capabilities';
import { macrosApi } from '@/api';
import * as usersApi from '@/api/users';
import {
  Button,
  ConfirmModal,
  Field,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuItems,
  MenuTrigger,
  Modal,
  SlaPill,
  type MenuItemSpec,
} from '@/components/ui';
import { goTo, tabPath } from '@/components/shell/openTab';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { localSaved, toast } from '@/store/useUi';
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
  suspend: {
    title: 'Suspender usuário',
    description: 'O solicitante não poderá mais abrir tickets. Você pode reativá-lo depois nas configurações.',
    confirm: 'Suspender usuário',
    done: 'Usuário suspenso',
  },
  spam: {
    title: 'Marcar como spam',
    description: 'O ticket será removido da fila (apagado localmente se o backend não suportar) e o solicitante será suspenso quando possível.',
    confirm: 'Marcar como spam',
    done: 'Ticket tratado como spam',
  },
  delete: {
    title: 'Apagar ticket',
    description: localHint('deleteTicket', 'O ticket some só neste navegador: o backend não apaga tickets de verdade.') ?? 'O ticket será apagado. Essa ação não pode ser desfeita.',
    confirm: 'Apagar',
    done: 'Ticket apagado',
  },
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

function closeTicketTab(ticketId: number): void {
  const key = `ticket:${ticketId}`;
  const tabs = useTabs.getState();
  if (tabs.tabs.some((t) => t.id === key)) {
    tabs.closeTab(key);
    const { tabs: left, activeTabId } = useTabs.getState();
    const next = left.find((t) => t.id === activeTabId);
    goTo(next ? tabPath(next) : '/agent/home');
  }
}

export function ConversationHeader({ ticket, filter, onFilterChange, showEvents, onToggleEvents, compact, onToggleCompact }: ConversationHeaderProps) {
  const navigate = useNavigate();
  const [danger, setDanger] = useState<Danger | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeBusy, setMergeBusy] = useState(false);
  const [dangerBusy, setDangerBusy] = useState(false);

  const topic = ticket.customFields.topico;
  const sentiment = ticket.customFields.sentimento as keyof typeof SENTIMENT_ICON | undefined;
  const SentimentIcon = sentiment ? SENTIMENT_ICON[sentiment] : undefined;
  const ChannelIcon = ticket.channel === 'email' ? Mail : Globe;

  const createMacroFromTicket = async () => {
    const lastPublic = [...ticket.comments].reverse().find((c) => c.public && c.bodyHtml?.trim());
    const bodyHtml = lastPublic?.bodyHtml ?? `<p>${ticket.subject}</p>`;
    try {
      const saved = await macrosApi.saveMacro({
        name: `A partir de #${ticket.reference ?? ticket.id}: ${ticket.subject}`.slice(0, 80),
        description: `Criada a partir do ticket #${ticket.id}`,
        availableTo: 'all',
        active: true,
        usage7d: 0,
        actions: {
          publicReply: bodyHtml,
          priority: ticket.priority,
          addTags: ticket.tags,
          status: ticket.statusId,
        },
      });
      toast.success(`Macro “${saved.name}” criada`, {
        action: { label: 'Abrir', onClick: () => navigate(`/admin/macros/${saved.id}`) },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar a macro.');
    }
  };

  const confirmDanger = async () => {
    if (!danger) return;
    setDangerBusy(true);
    try {
      if (danger === 'suspend') {
        if (!ticket.requesterId) throw new Error('Este ticket não tem solicitante identificável.');
        await usersApi.updateUser(ticket.requesterId, { suspended: true });
        toast.success(DANGER_COPY.suspend.done);
      } else if (danger === 'delete') {
        const ok = await useTickets.getState().deleteTickets([ticket.id]);
        if (ok) closeTicketTab(ticket.id);
      } else if (danger === 'spam') {
        // Backend não tem spam: suspende o solicitante (real) e remove o ticket da fila (local se preciso).
        if (ticket.requesterId) {
          try {
            await usersApi.updateUser(ticket.requesterId, { suspended: true });
          } catch (e) {
            // Segue para tirar o ticket da fila, mas avisa: o solicitante NÃO foi suspenso.
            toast.error(`O solicitante não foi suspenso: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
          }
        }
        const ok = await useTickets.getState().deleteTickets([ticket.id]);
        if (ok) {
          toast.success(localSaved(DANGER_COPY.spam.done, 'deleteTicket'));
          closeTicketTab(ticket.id);
        }
      }
      setDanger(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setDangerBusy(false);
    }
  };

  const confirmMerge = async () => {
    const targetId = Number(mergeTarget.trim().replace(/^#/, ''));
    if (!Number.isFinite(targetId) || targetId <= 0) {
      toast.error('Informe o número do ticket de destino.');
      return;
    }
    if (targetId === ticket.id) {
      toast.error('Escolha outro ticket, não o mesmo.');
      return;
    }
    setMergeBusy(true);
    try {
      const ok = await useTickets.getState().mergeTickets(targetId, [ticket.id]);
      if (ok) {
        toast.success(localSaved(`Ticket #${ticket.id} fundido em #${targetId}`, 'merge'));
        setMergeOpen(false);
        closeTicketTab(ticket.id);
        void useTickets.getState().loadDetail(targetId);
      }
    } finally {
      setMergeBusy(false);
    }
  };

  const items: MenuItemSpec[] = useMemo(
    () => [
      {
        id: 'macro',
        label: 'Criar como macro',
        icon: <Zap />,
        onSelect: () => void createMacroFromTicket(),
      },
      {
        id: 'merge',
        label: 'Fundir em outro ticket',
        icon: <Merge />,
        onSelect: () => {
          setMergeTarget('');
          setMergeOpen(true);
        },
      },
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
      {
        id: 'suspend',
        label: 'Suspender usuário',
        icon: <UserX />,
        tone: 'danger',
        onSelect: () => setDanger('suspend'),
      },
      {
        id: 'spam',
        label: 'Marcar como spam',
        icon: <Ban />,
        tone: 'danger',
        onSelect: () => setDanger('spam'),
      },
      {
        id: 'delete',
        label: 'Apagar',
        icon: <Trash2 />,
        tone: 'danger',
        onSelect: () => setDanger('delete'),
      },
    ],
    // ticket identity is enough; handlers close over current ticket
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticket.id, ticket.requesterId, ticket.subject, ticket.comments, ticket.tags, ticket.priority, ticket.statusId],
  );

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
          onOpenChange={(o) => !o && !dangerBusy && setDanger(null)}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirm}
          loading={dangerBusy}
          onConfirm={() => confirmDanger()}
        />
      ) : null}

      <Modal
        open={mergeOpen}
        onOpenChange={(o) => !mergeBusy && setMergeOpen(o)}
        title="Fundir em outro ticket"
        description={
          localHint('merge', 'A fusão só vale neste navegador: o backend ainda não une tickets.') ??
          `O ticket #${ticket.id} será fundido no destino. Comentários e eventos passam para o ticket principal.`
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={mergeBusy} onClick={() => setMergeOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={mergeBusy} onClick={() => void confirmMerge()}>
              Fundir
            </Button>
          </>
        }
      >
        <Field label="Número do ticket de destino">
          <Input
            inputMode="numeric"
            placeholder="Ex.: 42"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            disabled={mergeBusy}
          />
        </Field>
      </Modal>
    </header>
  );
}
