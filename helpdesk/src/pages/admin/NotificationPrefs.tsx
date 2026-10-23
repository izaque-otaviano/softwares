import { useLocation, useNavigate } from 'react-router-dom';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { CenterPanel } from '@/components/admin/notifications/CenterPanel';
import { PrefsPanel } from '@/components/admin/notifications/PrefsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';

/** Notificações: preferências por tipo e canal (`/admin/notificacoes`) e a central do usuário (`/admin/notificacoes/central`). */
export default function AdminNotificationPrefs() {
  const navigate = useNavigate();
  const tab = useLocation().pathname.replace(/\/+$/, '').endsWith('/central') ? 'central' : 'preferencias';
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Notificações' }]}
        title="Notificações"
        description="Escolha o que você quer receber e acompanhe seus avisos."
      />
      <AdminBody>
        <Tabs value={tab} onValueChange={(v) => navigate(v === 'central' ? '/admin/notificacoes/central' : '/admin/notificacoes')}>
          <TabsList aria-label="Notificações">
            <TabsTrigger value="preferencias">Preferências</TabsTrigger>
            <TabsTrigger value="central">Minhas notificações</TabsTrigger>
          </TabsList>
          <TabsContent value="preferencias" className="pt-4">
            <PrefsPanel />
          </TabsContent>
          <TabsContent value="central" className="pt-4">
            <CenterPanel />
          </TabsContent>
        </Tabs>
      </AdminBody>
    </>
  );
}
