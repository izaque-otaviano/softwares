import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isNewKey, useFormStore } from '@/components/ticket/formStore';
import { TicketScreen } from '@/components/ticket/TicketScreen';
import { Banner, Button, EmptyState, Skeleton } from '@/components/ui';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';

function TicketSkeleton() {
  return (
    <div role="status" aria-label="Carregando ticket" className="flex h-full flex-col">
      <div className="h-10 shrink-0 border-b border-line" />
      <div className="flex min-h-0 flex-1">
        <div className="w-props shrink-0 space-y-4 border-r border-line bg-surface-1 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton width={72} />
              <Skeleton className="h-8" width="100%" />
            </div>
          ))}
        </div>
        <div className="flex-1 space-y-3 p-6">
          <Skeleton className="h-5" width="45%" />
          <Skeleton className="h-20" width="100%" />
          <Skeleton className="h-20" width="80%" />
        </div>
      </div>
    </div>
  );
}

function ExistingTicket({ id }: { id: number }) {
  const navigate = useNavigate();
  const key = `ticket:${id}`;
  const { loaded, loading, error, load } = useTickets();
  const ticket = useTickets((s) => s.tickets.find((t) => t.id === id));
  const hasForm = useFormStore((s) => Boolean(s.forms[key]));

  useEffect(() => {
    if (!loaded && !loading && !error) void load();
  }, [loaded, loading, error, load]);

  // Modo real: a lista do backend não traz mensagens/eventos; busca o detalhe antes de abrir o formulário.
  const needsDetail = ticket?.detailed === false;
  const [detailError, setDetailError] = useState<string | null>(null);
  useEffect(() => {
    if (!needsDetail) return;
    setDetailError(null);
    useTickets.getState().loadDetail(id).catch((e: unknown) => setDetailError(e instanceof Error ? e.message : 'Não foi possível carregar o ticket.'));
  }, [needsDetail, id]);

  // A store só tem a 1ª página global (modo real): link direto, F5 ou resultado de busca podem apontar para um ticket
  // fora dela. Antes de dizer "não encontrado", pergunta ao servidor pelo id (404 = não existe mesmo).
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'missing'>('idle');
  const absent = loaded && !ticket && Number.isFinite(id);
  useEffect(() => {
    if (!absent) return;
    let alive = true;
    setLookup('loading');
    useTickets
      .getState()
      .loadDetail(id)
      .then(() => alive && setLookup('idle'))
      .catch(() => alive && setLookup('missing'));
    return () => {
      alive = false;
    };
  }, [absent, id]);

  useEffect(() => {
    if (ticket && !needsDetail && !hasForm) useFormStore.getState().init(key, ticket);
    // Atualização vinda do servidor (WebSocket): propriedades intocadas acompanham o ticket.
    else if (ticket && !needsDetail && hasForm) useFormStore.getState().rebase(key, ticket);
  }, [ticket, needsDetail, hasForm, key]);

  if (detailError && needsDetail)
    return (
      <div className="p-6">
        <Banner tone="error" title="Não foi possível carregar o ticket" onRetry={() => useTickets.getState().loadDetail(id).then(() => setDetailError(null), (e: unknown) => setDetailError(e instanceof Error ? e.message : 'Erro'))}>
          {detailError}
        </Banner>
      </div>
    );
  if (hasForm) return <TicketScreen key={key} ticketKey={key} />;
  if (error && !loaded)
    return (
      <div className="p-6">
        <Banner tone="error" title="Não foi possível carregar o ticket" onRetry={() => void load()}>
          {error}
        </Banner>
      </div>
    );
  if (loaded && !ticket && (lookup === 'missing' || !Number.isFinite(id)))
    return (
      <EmptyState
        illustration="search"
        title="Ticket não encontrado"
        description={`O ticket #${Number.isNaN(id) ? '' : id} não existe ou foi apagado.`}
        action={<Button variant="primary" onClick={() => navigate('/agent/home')}>Ir para o início</Button>}
      />
    );
  return <TicketSkeleton />;
}

function NewTicket() {
  const activeTabId = useTabs((s) => s.activeTabId);
  const key = activeTabId && isNewKey(activeTabId) ? activeTabId : null;
  const hasForm = useFormStore((s) => Boolean(key && s.forms[key]));
  const [params, setParams] = useSearchParams();
  const ticketsLoaded = useTickets((s) => s.loaded || s.loading || Boolean(s.error));
  useEffect(() => {
    if (!ticketsLoaded) void useTickets.getState().load(); // histórico do cliente no painel direito
  }, [ticketsLoaded]);
  const requester = params.get('requester');

  useEffect(() => {
    if (key && !hasForm) useFormStore.getState().init(key, null);
  }, [key, hasForm]);

  // `?requester=ID` pré-seleciona o solicitante (uma vez) e sai da URL para não reaplicar ao reabrir a aba.
  useEffect(() => {
    if (!key || !hasForm || !requester) return;
    const form = useFormStore.getState().forms[key];
    if (form && !form.values.requesterId) useFormStore.getState().patch(key, { requesterId: requester });
    setParams((p) => {
      p.delete('requester');
      return p;
    }, { replace: true });
  }, [key, hasForm, requester, setParams]);

  if (key && hasForm) return <TicketScreen key={key} ticketKey={key} />;
  return <TicketSkeleton />;
}

/** `/agent/tickets/:id` e `/agent/tickets/new`: a chave do formulário é a mesma da aba de trabalho. */
export default function TicketPage() {
  const { id } = useParams();
  if (id === undefined) return <NewTicket />;
  return <ExistingTicket id={Number(id)} />;
}
