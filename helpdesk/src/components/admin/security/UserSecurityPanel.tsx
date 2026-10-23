import { useState } from 'react';
import { getUserAccessHistory, revokeAllUserSessions, revokeUserSession } from '@/api/security';
import { useAsync } from '@/components/admin/useAsync';
import { Banner, Button, ConfirmModal, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { toast } from '@/store/useUi';
import type { AccountSession } from '@/types/admin-b';
import { AccessEventsTable } from './AccessEventsTable';
import { SessionsTable } from './SessionsTable';

export interface UserSecurityPanelProps {
  userId: string;
  userName: string;
  /** Mostrar as ações de encerrar sessões (só administradores; o backend recusa os demais com 403). */
  canManage?: boolean;
}

/**
 * Sessões e histórico de acessos de OUTRO usuário (visão do administrador): `/settings/users/{id}/access-history/` e
 * `/settings/users/{id}/sessions/`. Componente reutilizável: pode ser plugado na gaveta ou tela de detalhe de membros.
 */
export function UserSecurityPanel({ userId, userName, canManage = true }: UserSecurityPanelProps) {
  const history = useAsync(() => getUserAccessHistory(userId));
  const [one, setOne] = useState<AccountSession | null>(null);
  const [all, setAll] = useState(false);
  const sessions = history.data?.sessions ?? [];

  return (
    <div className="space-y-3">
      {history.error && !history.data ? <Banner tone="error" onRetry={history.reload}>{history.error}</Banner> : null}
      <Tabs defaultValue="sessoes">
        <TabsList aria-label={`Segurança de ${userName}`}>
          <TabsTrigger value="sessoes">Sessões{history.data ? ` (${sessions.length} de ${history.data.sessionLimit})` : ''}</TabsTrigger>
          <TabsTrigger value="logins">Acessos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="sessoes" className="space-y-3 pt-3">
          {canManage ? (
            <Button variant="outline" disabled={sessions.length === 0} onClick={() => setAll(true)}>
              Encerrar todas as sessões
            </Button>
          ) : null}
          <SessionsTable id="admin-user-sessions" aria-label={`Sessões de ${userName}`} sessions={sessions} loading={history.loading && !history.data} onRevoke={canManage ? setOne : undefined} />
        </TabsContent>
        <TabsContent value="logins" className="pt-3">
          <AccessEventsTable id="admin-user-logins" aria-label={`Últimos acessos de ${userName}`} events={history.data?.logins ?? []} loading={history.loading && !history.data} />
        </TabsContent>
        <TabsContent value="historico" className="pt-3">
          <AccessEventsTable id="admin-user-events" aria-label={`Histórico da conta de ${userName}`} events={history.data?.events ?? []} loading={history.loading && !history.data} />
        </TabsContent>
      </Tabs>
      <ConfirmModal
        open={one !== null}
        onOpenChange={(o) => !o && setOne(null)}
        title="Encerrar sessão"
        description={one ? `${userName} será desconectado(a) de ${one.browser}. Para voltar, precisará entrar de novo.` : undefined}
        confirmLabel="Encerrar sessão"
        onConfirm={async () => {
          if (!one) return;
          try {
            await revokeUserSession(userId, one.key);
            toast.success('Sessão encerrada');
            history.reload();
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível encerrar a sessão.'));
            throw e;
          }
        }}
      />
      <ConfirmModal
        open={all}
        onOpenChange={setAll}
        title="Encerrar todas as sessões"
        description={`${userName} será desconectado(a) de todos os dispositivos agora. Use em caso de perda de aparelho, desligamento ou acesso suspeito.`}
        confirmLabel="Encerrar todas"
        onConfirm={async () => {
          try {
            await revokeAllUserSessions(userId);
            toast.success('Sessões encerradas');
            history.reload();
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível encerrar as sessões.'));
            throw e;
          }
        }}
      />
    </div>
  );
}
