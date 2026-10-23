import { Link } from 'react-router-dom';
import { membersApi } from '@/api';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/useAsync';
import { Banner, Skeleton } from '@/components/ui';
import { useSession } from '@/store/useSession';
import { IS_REAL } from '@/api/mode';

/** Conta → Visão geral: quem está logado e assentos de agente (quando disponíveis). */
export default function AccountOverview() {
  const me = useSession((s) => s.user);
  const { data, loading, error, reload } = useAsync(() => membersApi.getLicenses());

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Conta' }, { label: 'Visão geral' }]}
        title="Visão geral"
        description="Resumo da conta nesta sessão. Marca, cobrança e SSO ainda não fazem parte desta versão."
      />
      <AdminBody className="flex max-w-2xl flex-col gap-6">
        {error ? (
          <Banner tone="error" onRetry={reload}>
            {error}
          </Banner>
        ) : null}

        <section className="rounded border border-line p-4" aria-labelledby="account-session">
          <h2 id="account-session" className="text-sm font-semibold">
            Sessão atual
          </h2>
          {me ? (
            <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-fg-muted">Nome</dt>
              <dd className="font-medium">{me.name}</dd>
              <dt className="text-fg-muted">E-mail</dt>
              <dd>{me.email}</dd>
              <dt className="text-fg-muted">Papel</dt>
              <dd className="capitalize">{me.role === 'admin' ? 'Administrador' : me.role === 'agent' ? 'Agente' : me.role}</dd>
              <dt className="text-fg-muted">Modo da API</dt>
              <dd>{IS_REAL ? 'Real (Resolv)' : 'Mock (local)'}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">Sem usuário na sessão.</p>
          )}
        </section>

        <section className="rounded border border-line p-4" aria-labelledby="account-seats">
          <h2 id="account-seats" className="text-sm font-semibold">
            Agentes
          </h2>
          {loading && !data ? (
            <Skeleton className="mt-3" height={24} width="40%" />
          ) : data ? (
            <p className="mt-2 text-sm">
              <span className="text-xl font-semibold tabular-nums">{data.used}</span>
              <span className="text-fg-muted">{data.unlimited ? ` ${data.used === 1 ? 'licença em uso' : 'licenças em uso'}, sem limite` : ` de ${data.total} licenças em uso`}</span>
            </p>
          ) : null}
          <p className="mt-2 text-xs text-fg-muted">
            {IS_REAL
              ? 'Licença = administrador, supervisor ou agente ativo (convite pendente conta). Clientes e agentes leves não ocupam licença.'
              : 'No modo mock o total de licenças é simulado.'}
          </p>
          <p className="mt-3 text-sm">
            <Link to="/admin/members" className="text-action hover:text-action-hover hover:underline">
              Gerenciar membros da equipe
            </Link>
          </p>
        </section>

        <section className="rounded border border-line border-dashed p-4 text-sm text-fg-muted" aria-labelledby="account-soon">
          <h2 id="account-soon" className="text-sm font-semibold text-fg">
            Ainda fora desta versão
          </h2>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Marca e personalização visual</li>
            <li>Assinatura, faturas e planos comerciais</li>
            <li>Política de senhas e autenticação única (SSO)</li>
          </ul>
        </section>
      </AdminBody>
    </>
  );
}
