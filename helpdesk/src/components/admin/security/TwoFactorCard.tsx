import { useState } from 'react';
import { confirmTwoFactor, disableTwoFactor, getTwoFactorStatus, requestDisableCode, setupTwoFactor } from '@/api/security';
import { IS_REAL } from '@/api/mode';
import { useAsync } from '@/components/admin/useAsync';
import { Banner, Button, Field, Input, Modal, Pill, Select, Skeleton } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { toast } from '@/store/useUi';
import type { TwoFactorMethod, TwoFactorSetup } from '@/types/admin-b';

export const METHOD_LABEL: Record<TwoFactorMethod, string> = { '': 'Desativada', email: 'Código por e-mail', totp: 'Aplicativo autenticador' };

const DEMO_HINT = !IS_REAL ? ' Modo de demonstração: o código aceito é 123456.' : '';

/**
 * Verificação em duas etapas da própria conta. Ativar: escolhe o método, recebe o segredo ou o código e confirma um código
 * válido (nada muda na conta antes disso). Desativar: exige um código do método atual. Não mexe em outras contas.
 */
export function TwoFactorCard() {
  const { data: status, loading, error, reload } = useAsync(getTwoFactorStatus);
  const [method, setMethod] = useState<'email' | 'totp'>('email');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [disabling, setDisabling] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState<string | undefined>();

  if (loading && !status) return <Skeleton height={96} />;
  if (error && !status) return <Banner tone="error" onRetry={reload}>{error}</Banner>;
  if (!status) return null;

  const start = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      setSetup(await setupTwoFactor(method));
      setCode('');
    } catch (e) {
      setProblem(errMessage(e, 'Não foi possível iniciar a ativação.'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      await confirmTwoFactor(code);
      setSetup(null);
      setCode('');
      toast.success('Verificação em duas etapas ativada');
      reload();
    } catch (e) {
      setProblem(errMessage(e, 'Código inválido ou expirado.'));
    } finally {
      setBusy(false);
    }
  };

  const openDisable = () => {
    setDisabling(true);
    setCodeSent(false);
    setDisableCode('');
    setDisableError(undefined);
  };

  const sendDisableCode = async () => {
    setBusy(true);
    setDisableError(undefined);
    try {
      await requestDisableCode();
      setCodeSent(true);
    } catch (e) {
      setDisableError(errMessage(e, 'Não foi possível enviar o código.'));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setDisableError(undefined);
    try {
      await disableTwoFactor(disableCode);
      setDisabling(false);
      toast.success('Verificação em duas etapas desativada');
      reload();
    } catch (e) {
      setDisableError(errMessage(e, 'Código inválido ou expirado.'));
    } finally {
      setBusy(false);
    }
  };

  const active = status.method !== '';
  const needsEmailCode = status.method === 'email';

  return (
    <section aria-labelledby="tf-title" className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="tf-title" className="text-md font-semibold text-fg">
          Verificação em duas etapas
        </h2>
        <Pill tone={active ? 'action' : 'neutral'}>{active ? `Ativada: ${METHOD_LABEL[status.method]}` : 'Desativada'}</Pill>
      </div>
      <p className="text-sm text-fg-muted">Além da senha, o login pede um código. Isso protege a conta mesmo se a senha vazar.</p>
      {status.required && !active ? (
        <Banner tone="info">O administrador exige a verificação para todos. Enquanto você não configurar, o código chega por e-mail.</Banner>
      ) : null}
      {status.pending && !setup ? <Banner tone="info">Há uma ativação começada e não concluída. Comece de novo abaixo para receber um código novo.</Banner> : null}

      {active ? (
        <Button variant="outline" onClick={openDisable}>
          Desativar verificação em duas etapas
        </Button>
      ) : setup ? (
        <div className="space-y-3 rounded border border-line p-4">
          {setup.method === 'totp' ? (
            <>
              <p className="text-sm text-fg">No aplicativo autenticador (Google Authenticator, Authy, 1Password...), adicione uma conta com esta chave e digite o código de 6 dígitos que ele mostrar.</p>
              <Field label="Chave de configuração">
                <Input readOnly value={setup.secret ?? ''} aria-label="Chave de configuração do aplicativo" onFocus={(e) => e.currentTarget.select()} className="font-mono" />
              </Field>
              {setup.otpauthUri ? (
                <p className="break-all text-xs text-fg-muted">
                  Link para abrir direto no aplicativo: <a href={setup.otpauthUri} className="text-action hover:text-action-hover">{setup.otpauthUri}</a>
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-fg">Enviamos um código para o seu e-mail. Ele vale por poucos minutos.{DEMO_HINT}</p>
          )}
          <Field label="Código de 6 dígitos" required>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-40" />
          </Field>
          {problem ? <Banner tone="error">{problem}</Banner> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={busy} disabled={code.length < 6} onClick={() => void confirm()}>
              Confirmar e ativar
            </Button>
            {setup.method === 'email' ? (
              <Button variant="outline" disabled={busy} onClick={() => void start()}>
                Reenviar código
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                setSetup(null);
                setProblem(undefined);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Método">
            <Select
              aria-label="Método de verificação"
              value={method}
              onValueChange={(v) => setMethod(v as 'email' | 'totp')}
              options={[
                { value: 'email', label: 'Código por e-mail' },
                { value: 'totp', label: 'Aplicativo autenticador' },
              ]}
              className="w-64"
            />
          </Field>
          {problem ? <Banner tone="error">{problem}</Banner> : null}
          <Button variant="primary" loading={busy} onClick={() => void start()}>
            Ativar verificação em duas etapas
          </Button>
        </div>
      )}

      <Modal
        open={disabling}
        onOpenChange={setDisabling}
        title="Desativar verificação em duas etapas"
        description="Sua conta voltará a entrar só com a senha. Para confirmar que é você, digite um código do método atual."
        footer={
          <>
            <Button variant="outline" onClick={() => setDisabling(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={busy} disabled={disableCode.length < 6 || (needsEmailCode && !codeSent)} onClick={() => void disable()}>
              Desativar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {needsEmailCode ? (
            <div>
              <Button variant="outline" disabled={busy} onClick={() => void sendDisableCode()}>
                {codeSent ? 'Reenviar código por e-mail' : 'Enviar código por e-mail'}
              </Button>
              {codeSent ? <p className="mt-1 text-sm text-fg-muted">Código enviado.{DEMO_HINT}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-fg-muted">Abra o aplicativo autenticador e digite o código atual.{DEMO_HINT}</p>
          )}
          <Field label="Código de 6 dígitos" required>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))} className="w-40" />
          </Field>
          {disableError ? <Banner tone="error">{disableError}</Banner> : null}
        </div>
      </Modal>
    </section>
  );
}
