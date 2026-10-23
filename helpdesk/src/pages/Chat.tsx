import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChatList } from '@/components/chat/ChatList';
import { ChatSettings } from '@/components/chat/ChatSettings';
import { ClientPanel } from '@/components/chat/ClientPanel';
import { ConversationPane, NarrowButtons } from '@/components/chat/ConversationPane';
import { Drawer, EmptyState, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { useCan } from '@/lib/permissions';
import { useChatStore } from '@/store/chat';

const WIDE = '(min-width: 1024px)';

/** Verdadeiro em telas de 1024 px ou mais. Sem `matchMedia` (testes) considera a tela larga. */
function useWide(): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE).matches : true);
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const wide = useWide();
  const canView = useCan(['chat.view', 'chat.handle']);
  const canConfigure = useCan('settings.manage');
  const [view, setView] = useState<'chats' | 'settings'>('chats');
  const [listOpen, setListOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const chat = useChatStore((s) => s.conversation?.chat ?? null);

  // Caixa de entrada em tempo real e revalidação periódica: ligadas só enquanto a tela existe.
  useEffect(() => {
    if (!canView) return;
    const s = useChatStore.getState();
    s.start();
    void s.refreshCounts();
    return () => useChatStore.getState().stop();
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    void useChatStore.getState().select(id ?? null);
  }, [id, canView]);

  const open = useCallback(
    (chatId: string) => {
      setListOpen(false);
      navigate(`/agent/chat/${chatId}`);
    },
    [navigate],
  );

  if (!canView) {
    return (
      <section aria-label="Chat" className="flex h-full flex-col px-6 pt-5">
        <h1 className="text-xl font-normal text-fg">Chat</h1>
        <EmptyState illustration="box" title="Sem acesso ao chat" description="Sua função não tem permissão para ver o atendimento por chat. Peça a um administrador." />
      </section>
    );
  }

  const list = <ChatList selectedId={id ?? null} onSelect={(c) => open(c.id)} className="min-h-0 flex-1" />;
  const panel = <ClientPanel chat={chat} onOpenChat={open} />;

  return (
    <section aria-label="Chat" className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-end justify-between gap-4 border-b border-line px-6 pt-4">
        <h1 className="pb-2 text-xl font-normal text-fg">Chat</h1>
        {canConfigure ? (
          <Tabs value={view} onValueChange={(v) => setView(v as 'chats' | 'settings')}>
            <TabsList aria-label="Seções do chat" className="border-b-0">
              <TabsTrigger value="chats">Conversas</TabsTrigger>
              <TabsTrigger value="settings">Configurações</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </header>

      <div hidden={view !== 'chats'} className="min-h-0 flex-1">
        {wide ? (
            <div className="grid h-full min-h-0 grid-cols-[20rem_minmax(0,1fr)_20rem]">
              <div className="flex min-h-0 flex-col border-r border-line">{list}</div>
              <div className="flex min-h-0 min-w-0 flex-col">
                <ConversationPane onTaken={() => useChatStore.getState().setScope('mine')} />
              </div>
              <div className="flex min-h-0 flex-col border-l border-line">{panel}</div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <ConversationPane
                leading={<NarrowButtons onList={() => setListOpen(true)} />}
                trailing={<NarrowButtons onClient={() => setClientOpen(true)} />}
                onTaken={() => useChatStore.getState().setScope('mine')}
              />
              <Drawer open={listOpen} onOpenChange={setListOpen} title="Conversas" bodyClassName="p-0 flex flex-col">
                {list}
              </Drawer>
              <Drawer open={clientOpen} onOpenChange={setClientOpen} title="Dados do cliente" bodyClassName="p-0 flex flex-col">
                {panel}
              </Drawer>
            </div>
          )}
      </div>
      {view === 'settings' && canConfigure ? <ChatSettings /> : null}
    </section>
  );
}
