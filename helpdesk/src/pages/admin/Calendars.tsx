import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import * as api from '@/api/calendars';
import CalendarEditPage from '@/components/admin/calendars/CalendarEditPage';
import { CalendarsList } from '@/components/admin/calendars/CalendarsList';
import { HolidaysList } from '@/components/admin/calendars/HolidaysList';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/lists/useAsync';
import { ReadOnlyNotice } from '@/components/admin/sla/adminAForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { SETTINGS_WRITE } from '@/lib/adminAPermissions';
import { useCan } from '@/lib/permissions';

function Overview() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canWrite = useCan(SETTINGS_WRITE);
  const state = useAsync(() => api.listCalendars());
  const tab = pathname.endsWith('/feriados') ? 'feriados' : 'calendarios';
  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Calendários e feriados' }]}
        title="Calendários e feriados"
        description="O horário de atendimento (com fuso e feriados) define quando o prazo de SLA corre e quando o chat está aberto."
      />
      {canWrite ? null : <ReadOnlyNotice>Você pode consultar os calendários e feriados, mas só administradores alteram.</ReadOnlyNotice>}
      <Tabs value={tab} onValueChange={(v) => navigate(v === 'feriados' ? '/admin/calendarios/feriados' : '/admin/calendarios')} className="mt-2">
        <TabsList aria-label="Calendários e feriados" className="px-6">
          <TabsTrigger value="calendarios">Calendários</TabsTrigger>
          <TabsTrigger value="feriados">Feriados</TabsTrigger>
        </TabsList>
        <TabsContent value="calendarios">
          <CalendarsList {...state} />
        </TabsContent>
        <TabsContent value="feriados">
          <HolidaysList {...state} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminCalendars() {
  return (
    <Routes>
      <Route index element={<Overview />} />
      <Route path="feriados" element={<Overview />} />
      <Route path=":id" element={<CalendarEditPage />} />
    </Routes>
  );
}
