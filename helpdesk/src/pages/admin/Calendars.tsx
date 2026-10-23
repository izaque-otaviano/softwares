import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/ui';

/** Provisório: a tela é construída em seguida. */
export default function AdminCalendars() {
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Calendários e feriados' }]} title="Calendários e feriados" description="Horário de atendimento e dias sem expediente." />
      <EmptyState illustration="box" title="Em construção" description="Esta tela está sendo construída." />
    </>
  );
}
