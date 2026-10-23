import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/ui';

/** Provisório: a tela é construída em seguida. */
export default function AdminRetention() {
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Retenção de dados' }]} title="Retenção de dados" description="Por quanto tempo cada dado é guardado." />
      <EmptyState illustration="box" title="Em construção" description="Esta tela está sendo construída." />
    </>
  );
}
