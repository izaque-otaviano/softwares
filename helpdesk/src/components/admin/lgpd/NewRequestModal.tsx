import { useEffect, useState } from 'react';
import { createRequest } from '@/api/lgpd';
import { Banner, Button, Field, Modal, Select, Textarea } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { toast } from '@/store/useUi';
import type { DataSubjectRequest, DsrKind } from '@/types/admin-b';
import { UserPicker } from '../audit/UserPicker';
import { KIND_LABEL } from './dsrText';

/** Abre um pedido de titular. Criar o pedido NÃO executa nada. */
export function NewRequestModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: DataSubjectRequest) => void }) {
  const [kind, setKind] = useState<DsrKind>('export');
  const [subject, setSubject] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setKind('export');
      setSubject(null);
      setNotes('');
      setError(undefined);
    }
  }, [open]);

  const submit = async () => {
    if (!subject) {
      setError('Escolha o titular do pedido.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const created = await createRequest({ kind, subjectUserId: subject, notes: notes.trim() || undefined });
      toast.success('Pedido aberto. Nada foi executado.');
      onCreated(created);
      onOpenChange(false);
    } catch (e) {
      setError(errMessage(e, 'Não foi possível abrir o pedido.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo pedido de titular"
      description="Abrir o pedido só o coloca na fila. Verificação e execução são passos separados."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Abrir pedido
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tipo de pedido">
          <Select aria-label="Tipo de pedido" value={kind} onValueChange={(v) => setKind(v as DsrKind)} options={(['export', 'anonymize'] as DsrKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </Field>
        <Field label="Titular" required>
          <UserPicker value={subject} onChange={setSubject} aria-label="Titular do pedido" placeholder="Escolha uma pessoa" clientsOnly />
        </Field>
        <Field label="Observações" hint="Como o pedido chegou, protocolo, etc.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error ? <Banner tone="error">{error}</Banner> : null}
      </div>
    </Modal>
  );
}
