import { useEffect, useState, type ReactNode } from 'react';
import { errMessage } from '@/lib/apiError';
import { Banner, Button, Field, Input, Modal } from '@/components/ui';

export interface StrongConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** O que vai acontecer e por que não há volta. */
  consequences: ReactNode;
  /** Texto exato que a pessoa precisa digitar (ex.: `LGPD-12`). */
  identifier: string;
  confirmLabel: string;
  /** Campos extras (justificativa...). */
  children?: ReactNode;
  /** Falso mantém o botão desligado mesmo com o identificador certo. */
  extraValid?: boolean;
  onConfirm: () => Promise<void>;
  tone?: 'danger' | 'primary';
}

/**
 * Confirmação forte para ações irreversíveis: explica o efeito e só libera o botão depois de digitar o identificador.
 * Em caso de erro o modal continua aberto, mostrando a mensagem do servidor.
 */
export function StrongConfirmModal({ open, onOpenChange, title, consequences, identifier, confirmLabel, children, extraValid = true, onConfirm, tone = 'danger' }: StrongConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setTyped('');
      setError(undefined);
      setBusy(false);
    }
  }, [open]);

  const matches = typed.trim() === identifier;
  const run = async () => {
    if (!matches || !extraValid || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(errMessage(e, 'Não foi possível concluir. Nada foi alterado.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={tone} loading={busy} disabled={!matches || !extraValid} onClick={() => void run()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Banner tone={tone === 'danger' ? 'warning' : 'info'}>{consequences}</Banner>
        {children}
        <Field label={`Digite ${identifier} para confirmar`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-label={`Digite ${identifier} para confirmar`} />
        </Field>
        {error ? (
          <Banner tone="error" title="Não foi concluído">
            {error}
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}
