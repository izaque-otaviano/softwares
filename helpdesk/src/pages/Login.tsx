import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { safeRedirect } from '@/components/auth/RequireSession';
import { Banner, Button, Field, Input } from '@/components/ui';
import { useNow } from '@/lib/useNow';
import { waitText } from '@/lib/time';
import { useSession } from '@/store/useSession';

const METHOD_TEXT = {
  email: 'Enviamos um código de verificação para o seu e-mail.',
  totp: 'Digite o código do seu aplicativo autenticador.',
} as const;

/** Tela de entrada: e-mail e senha; se a conta tiver 2FA, pede o código em seguida. Só aparece no modo real. */
export default function Login() {
  const status = useSession((s) => s.status);
  const twoFactor = useSession((s) => s.twoFactor);
  const error = useSession((s) => s.error);
  const expired = useSession((s) => s.expired);
  const retryUntil = useSession((s) => s.retryUntil);
  const now = useNow(retryUntil ? 1000 : 0);
  const waitSeconds = retryUntil ? Math.max(0, Math.ceil((retryUntil - now.getTime()) / 1000)) : 0;
  const waiting = waitSeconds > 0;
  const location = useLocation();
  const navigate = useNavigate();
  const from = safeRedirect((location.state as { from?: string } | null)?.from);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (useSession.getState().status === 'loading') void useSession.getState().restore();
  }, []);
  useEffect(() => {
    if (status === 'two_factor') codeRef.current?.focus();
  }, [status]);
  useEffect(() => {
    // Fim da espera do limite de tentativas: libera o botão (o relógio da página é o que manda).
    if (retryUntil && retryUntil <= now.getTime()) useSession.getState().clearWait();
  }, [retryUntil, now]);
  useEffect(() => {
    if (status === 'authenticated') navigate(from, { replace: true });
  }, [status, from, navigate]);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || waiting || !email.trim() || !password) return;
    setBusy(true);
    await useSession.getState().login(email, password);
    setBusy(false);
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || waiting || !code.trim()) return;
    setBusy(true);
    setResent(false);
    const ok = await useSession.getState().verifyTwoFactor(code);
    setBusy(false);
    if (!ok) setCode('');
  };

  const resend = async () => {
    setResent(false);
    if (await useSession.getState().resendTwoFactor()) setResent(true);
  };

  const backToCredentials = () => {
    setCode('');
    setPassword('');
    setResent(false);
    useSession.setState({ status: 'anonymous', twoFactor: null, error: null });
  };

  const inTwoFactor = status === 'two_factor' && twoFactor !== null;

  return (
    <main id="conteudo" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-surface-1 px-4 py-8 text-fg outline-none">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded bg-ink-active text-md font-semibold text-fg-inverse">
            H
          </span>
          <span className="text-xl font-semibold">Helpdesk</span>
        </div>
        <div className="rounded-lg border border-line bg-surface p-6 shadow-menu">
          <h1 className="text-xl font-semibold">{inTwoFactor ? 'Verificação em duas etapas' : 'Entrar'}</h1>
          <p className="mb-4 mt-1 text-sm text-fg-muted">
            {inTwoFactor ? METHOD_TEXT[twoFactor] : 'Use o e-mail e a senha da sua conta de agente.'}
          </p>
          <div className="mb-4 flex flex-col gap-2" aria-live="polite">
            {expired && !error && status === 'anonymous' ? <Banner tone="warning">Sua sessão expirou. Entre novamente para continuar.</Banner> : null}
            {error ? (
              <Banner tone="error" onDismiss={() => useSession.getState().clearError()}>
                {error}
              </Banner>
            ) : null}
            {resent ? <Banner tone="success">Código reenviado.</Banner> : null}
            {waiting ? (
              <p className="text-sm text-fg-muted">
                Você poderá tentar de novo em <span className="font-medium text-fg tabular-nums">{waitText(waitSeconds)}</span>.
              </p>
            ) : null}
          </div>

          {inTwoFactor ? (
            <form onSubmit={submitCode} className="flex flex-col gap-4" noValidate>
              <Field label="Código de verificação" required>
                <Input ref={codeRef} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} />
              </Field>
              <Button type="submit" size="lg" loading={busy} disabled={!code.trim() || waiting}>
                Verificar
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={backToCredentials} className="text-action underline-offset-2 hover:underline focus-visible:shadow-focus">
                  Voltar
                </button>
                <button type="button" onClick={() => void resend()} className="text-action underline-offset-2 hover:underline focus-visible:shadow-focus">
                  Reenviar código
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submitCredentials} className="flex flex-col gap-4" noValidate>
              <Field label="E-mail" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
              </Field>
              <Field label="Senha" required>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </Field>
              <Button type="submit" size="lg" loading={busy} disabled={!email.trim() || !password || waiting}>
                Entrar
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
