import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/ui';

/** Provisório: a tela é construída em seguida. */
export default function AdminPlans() {
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Planos' }]} title="Planos" description="Planos de atendimento das empresas." />
      <EmptyState illustration="box" title="Em construção" description="Esta tela está sendo construída." />
    </>
  );
}
