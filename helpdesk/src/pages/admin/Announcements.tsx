import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/ui';

/** Provisório: a tela é construída em seguida. */
export default function AdminAnnouncements() {
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Avisos' }]} title="Avisos" description="Avisos para a equipe." />
      <EmptyState illustration="box" title="Em construção" description="Esta tela está sendo construída." />
    </>
  );
}
