import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/ui';

/** Provisório: a tela é construída em seguida. */
export default function AdminBackups() {
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Backups' }]} title="Backups" description="Ver, criar, restaurar e agendar backups." />
      <EmptyState illustration="box" title="Em construção" description="Esta tela está sendo construída." />
    </>
  );
}
