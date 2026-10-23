import { useState } from 'react';
import { changeMyPassword } from '@/api/security';
import { ApiError } from '@/api/errors';
import { Banner, Button, Field, Input } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { toast } from '@/store/useUi';

/** Troca da própria senha, provando a atual. As outras sessões continuam abertas: para derrubá-las, use a aba Sessões. */
export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [general, setGeneral] = useState<string | undefined>();

  const mismatch = again !== '' && again !== next ? 'As senhas não conferem.' : undefined;

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setGeneral(undefined);
    try {
      await changeMyPassword({ currentPassword: current, newPassword: next });
      toast.success('Senha trocada');
      setCurrent('');
      setNext('');
      setAgain('');
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        setErrors(e.fieldErrors);
        if (!e.fieldErrors.current_password && !e.fieldErrors.new_password) setGeneral(errMessage(e, 'Não foi possível trocar a senha.'));
      } else {
        setGeneral(errMessage(e, 'Não foi possível trocar a senha.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismatch && current && next) void submit();
      }}
    >
      <h2 className="text-md font-semibold text-fg">Trocar senha</h2>
      <p className="text-sm text-fg-muted">Quem entra pelo Google não tem senha própria e não precisa disto. Trocar a senha não encerra as sessões já abertas.</p>
      <Field label="Senha atual" required error={errors.current_password?.[0]}>
        <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="Nova senha" required error={errors.new_password?.join(' ')}>
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Repita a nova senha" required error={mismatch}>
        <Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </Field>
      {general ? <Banner tone="error">{general}</Banner> : null}
      <Button type="submit" variant="primary" loading={busy} disabled={!current || !next || Boolean(mismatch) || !again}>
        Trocar senha
      </Button>
    </form>
  );
}
