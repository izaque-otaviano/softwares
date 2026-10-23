import { useState } from 'react';
import { Banner, Button, Field, Input, Modal } from '@/components/ui';
import type { BackupFile } from '@/types/admin-a';
import { formatBytes } from './backupText';

export interface RestoreBackupModalProps {
  /** Backup a restaurar; `null` fecha o modal. */
  file: BackupFile | null;
  onOpenChange: (open: boolean) => void;
  /** Dispara a restauração. Só é chamado depois de o nome do backup ser digitado por inteiro. */
  onConfirm: (file: BackupFile) => Promise<void>;
}

/**
 * Confirmação forte da restauração: explica que SUBSTITUI todos os dados atuais e exige digitar o nome do backup.
 * O botão fica desabilitado até o texto bater exatamente.
 */
export function RestoreBackupModal({ file, onOpenChange, onConfirm }: RestoreBackupModalProps) {
  return (
    <Modal open={file !== null} onOpenChange={onOpenChange} title="Restaurar backup" size="md">
      {file ? <RestoreBody file={file} onOpenChange={onOpenChange} onConfirm={onConfirm} /> : null}
    </Modal>
  );
}

function RestoreBody({ file, onOpenChange, onConfirm }: { file: BackupFile; onOpenChange: (o: boolean) => void; onConfirm: (f: BackupFile) => Promise<void> }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed === file.name;

  const run = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(file);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Não foi possível iniciar a restauração.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
      className="space-y-4"
    >
      <Banner tone="error" title="Esta ação substitui todos os dados atuais">
        Tickets, clientes, usuários e configurações voltam ao estado de {file.name} ({formatBytes(file.sizeBytes)}). Tudo o que foi criado ou alterado depois da data do backup será perdido. O sistema tira um backup de segurança antes de restaurar, mas o processo não pode ser desfeito pela tela e pode derrubar as sessões abertas.
      </Banner>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Field label={`Para confirmar, digite o nome do backup: ${file.name}`} required>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} placeholder={file.name} />
      </Field>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => !busy && onOpenChange(false)} aria-disabled={busy || undefined}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" disabled={!matches} loading={busy}>
          Restaurar backup
        </Button>
      </div>
    </form>
  );
}
