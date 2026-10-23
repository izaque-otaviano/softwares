import { useLocation, useNavigate } from 'react-router-dom';
import { revokeMySession, getMyAccessHistory } from '@/api/security';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/useAsync';
import { AccessEventsTable } from '@/components/admin/security/AccessEventsTable';
import { MyDataCard } from '@/components/admin/security/MyDataCard';
import { PasswordForm } from '@/components/admin/security/PasswordForm';
import { SessionsTable } from '@/components/admin/security/SessionsTable';
import { TwoFactorCard } from '@/components/admin/security/TwoFactorCard';
import { Banner, ConfirmModal, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { toast } from '@/store/useUi';
import type { AccountSession } from '@/types/admin-b';
import { useState } from 'react';

const TABS = ['verificacao', 'sessoes', 'historico', 'senha', 'dados'] as const;
type Tab = (typeof TABS)[number];

/** Segurança da conta do usuário logado: `/admin/seguranca/{verificacao|sessoes|historico|senha|dados}`. */
export default function AdminSecurity() {
  const navigate = useNavigate();
  const last = useLocation().pathname.replace(/\/+$/, '').split('/').pop() as Tab;
  const tab: Tab = TABS.includes(last) ? last : 'verificacao';
  const history = useAsync(getMyAccessHistory);
  const [revoking, setRevoking] = useState<AccountSession | null>(null);
  const loadError = history.error && !history.data ? { message: history.error, onRetry: history.reload } : undefined;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Segurança da conta' }]}
        title="Segurança da conta"
        description="Verificação em duas etapas, sessões abertas e histórico de acessos da sua conta."
      />
      <AdminBody>
        <Tabs value={tab} onValueChange={(v) => navigate(v === 'verificacao' ? '/admin/seguranca' : `/admin/seguranca/${v}`)}>
          <TabsList aria-label="Segurança da conta">
            <TabsTrigger value="verificacao">Verificação em duas etapas</TabsTrigger>
            <TabsTrigger value="sessoes">Sessões</TabsTrigger>
            <TabsTrigger value="historico">Histórico de acessos</TabsTrigger>
            <TabsTrigger value="senha">Senha</TabsTrigger>
            <TabsTrigger value="dados">Meus dados</TabsTrigger>
          </TabsList>
          <TabsContent value="verificacao" className="pt-4">
            <TwoFactorCard />
          </TabsContent>
          <TabsContent value="sessoes" className="space-y-3 pt-4">
            <Banner tone="info">
              Você pode ter até {history.data?.sessionLimit ?? 3} sessões ao mesmo tempo: ao entrar de novo, a mais antiga é encerrada. Encerrar uma sessão desconecta aquele dispositivo na hora. A sessão deste dispositivo não pode ser encerrada aqui.
            </Banner>
            <SessionsTable id="my-sessions" aria-label="Suas sessões abertas" sessions={history.data?.sessions ?? []} loading={history.loading && !history.data} error={loadError} onRevoke={setRevoking} />
          </TabsContent>
          <TabsContent value="historico" className="space-y-6 pt-4">
            <section aria-labelledby="h-logins">
              <h2 id="h-logins" className="mb-2 text-md font-semibold text-fg">
                Últimos acessos
              </h2>
              <AccessEventsTable id="my-logins" aria-label="Últimos acessos à sua conta" events={history.data?.logins ?? []} loading={history.loading && !history.data} error={loadError} />
            </section>
            <section aria-labelledby="h-events">
              <h2 id="h-events" className="mb-2 text-md font-semibold text-fg">
                Linha do tempo da conta
              </h2>
              <AccessEventsTable id="my-events" aria-label="Linha do tempo da sua conta" events={history.data?.events ?? []} loading={history.loading && !history.data} error={loadError} />
            </section>
          </TabsContent>
          <TabsContent value="senha" className="pt-4">
            <PasswordForm />
          </TabsContent>
          <TabsContent value="dados" className="pt-4">
            <MyDataCard />
          </TabsContent>
        </Tabs>
      </AdminBody>
      <ConfirmModal
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Encerrar sessão"
        description={revoking ? `Esta sessão em ${revoking.browser} será desconectada agora. Para voltar, será preciso entrar de novo.` : undefined}
        confirmLabel="Encerrar sessão"
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await revokeMySession(revoking.key);
            toast.success('Sessão encerrada');
            history.reload();
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível encerrar a sessão.'));
            throw e;
          }
        }}
      />
    </>
  );
}
