import { useLocation, useNavigate } from 'react-router-dom';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { AUDIT_ACCESS, NO_PERMISSION_MESSAGE } from '@/components/admin/audit/adminAccess';
import { AuditLogsPanel } from '@/components/admin/audit/AuditLogsPanel';
import { TicketAccessPanel } from '@/components/admin/audit/TicketAccessPanel';
import { Banner, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { useCan } from '@/lib/permissions';

/** Registros de auditoria: `/admin/auditoria` (alterações) e `/admin/auditoria/acessos` (leituras de tickets restritos). */
export default function AdminAudit() {
  const canRead = useCan(AUDIT_ACCESS);
  const navigate = useNavigate();
  const tab = useLocation().pathname.replace(/\/+$/, '').endsWith('/acessos') ? 'acessos' : 'registros';
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Registros de auditoria' }]}
        title="Registros de auditoria"
        description="Quem fez o quê e quando. Os registros só podem ser lidos: ninguém altera nem apaga."
      />
      <AdminBody>
        {canRead ? (
          <Tabs value={tab} onValueChange={(v) => navigate(v === 'acessos' ? '/admin/auditoria/acessos' : '/admin/auditoria')}>
            <TabsList aria-label="Tipo de registro">
              <TabsTrigger value="registros">Alterações</TabsTrigger>
              <TabsTrigger value="acessos">Acessos a tickets</TabsTrigger>
            </TabsList>
            <TabsContent value="registros" className="pt-4">
              <AuditLogsPanel />
            </TabsContent>
            <TabsContent value="acessos" className="pt-4">
              <TicketAccessPanel />
            </TabsContent>
          </Tabs>
        ) : (
          <Banner tone="info">{NO_PERMISSION_MESSAGE} Os registros de auditoria são exclusivos de administradores.</Banner>
        )}
      </AdminBody>
    </>
  );
}
