import { Link, useLocation } from 'react-router-dom';
import { ALL_NAV_ITEMS } from '@/components/admin/nav';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/ui';

/** Destino dos itens de menu de exemplo (`/admin/fora-desta-versao/:slug`) e de rotas desconhecidas em `/admin`. */
export default function OutOfScope() {
  const { pathname } = useLocation();
  const item = ALL_NAV_ITEMS.find((i) => i.to === pathname);
  return (
    <>
      <PageHeader breadcrumb={item ? [{ label: item.section.label }, { label: item.label }] : [{ label: 'Administração' }]} title={item?.label ?? 'Página não encontrada'} />
      <EmptyState
        illustration="binoculars"
        title="Fora desta versão"
        description="Esta área existe na central de administração, mas não faz parte deste protótipo."
        action={
          <Link to="/admin" className="rounded-xs text-action outline-none hover:text-action-hover focus-visible:shadow-focus">
            Voltar ao início
          </Link>
        }
      />
    </>
  );
}
