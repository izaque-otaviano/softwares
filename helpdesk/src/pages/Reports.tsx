import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { Async } from '@/components/reports/Async';
import { ChatTab } from '@/components/reports/ChatTab';
import { FilterBar } from '@/components/reports/FilterBar';
import { TicketsTab } from '@/components/reports/TicketsTab';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { filterKey, filtersFor, useReports, type ReportTab } from '@/store/reports';
import { toast } from '@/store/useUi';

const clock = (ms: number): string => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function Reports() {
  const s = useReports();
  const { tab } = s;
  const slot = tab === 'tickets' ? s.tickets : s.chat;
  const key = filterKey(filtersFor(s, tab));
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    void useReports.getState().ensure(tab);
  }, [tab, key]);

  useEffect(() => {
    if (slot.updatedAt && !slot.loading && !slot.error) setAnnounce(`Relatório atualizado às ${clock(slot.updatedAt)}.`);
  }, [slot.updatedAt, slot.loading, slot.error]);

  const exportCsv = async () => {
    const res = await useReports.getState().exportCsv();
    if (res.ok) toast.success('CSV exportado', { description: res.filename });
    else toast.error('Não foi possível exportar', { description: res.message });
  };

  const retry = () => void useReports.getState().refresh(tab);

  return (
    <section aria-label="Relatórios" className="h-full overflow-y-auto">
      <PageHeader
        title="Relatórios"
        description="Métricas de tickets e de chat. Os números vêm direto do backend; o que ele não calcula aparece marcado como indisponível."
        actions={
          <>
            {slot.updatedAt ? <span className="text-xs text-fg-muted">Atualizado às {clock(slot.updatedAt)}</span> : null}
            <Button variant="outline" onClick={retry} loading={slot.loading} leadingIcon={<RefreshCw aria-hidden className="h-4 w-4" />}>
              Atualizar
            </Button>
          </>
        }
      />
      <span role="status" aria-live="polite" className="sr-only">{announce}</span>
      <AdminBody className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => s.setTab(v as ReportTab)}>
          <TabsList aria-label="Tipo de relatório">
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>
          <div className="mt-4">
            <FilterBar tab={tab} />
          </div>
          <TabsContent value="tickets" className="mt-4">
            <Async loading={s.tickets.loading} error={s.tickets.error} hasData={!!s.tickets.data} onRetry={retry}>
              {s.tickets.data ? <TicketsTab report={s.tickets.data} onExport={() => void exportCsv()} exporting={s.exporting} /> : null}
            </Async>
          </TabsContent>
          <TabsContent value="chat" className="mt-4">
            <Async loading={s.chat.loading} error={s.chat.error} hasData={!!s.chat.data} onRetry={retry}>
              {s.chat.data ? <ChatTab report={s.chat.data} /> : null}
            </Async>
          </TabsContent>
        </Tabs>
      </AdminBody>
    </section>
  );
}
