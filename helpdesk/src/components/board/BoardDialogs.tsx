import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal } from '@/components/ui';
import { dateInputToIso, isoToDateInput } from './boardModel';

/** Pede um nome (novo quadro, renomear quadro, nova coluna, renomear coluna). */
export function NameDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initial?: string;
  confirmLabel: string;
  maxLength: number;
  hint?: string;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (props.open) setName(props.initial ?? '');
  }, [props.open, props.initial]);
  const clean = name.trim();
  const submit = async () => {
    if (!clean || busy) return;
    setBusy(true);
    const ok = await props.onSubmit(clean);
    setBusy(false);
    if (ok) props.onOpenChange(false);
  };
  return (
    <Modal
      open={props.open}
      onOpenChange={(o) => !busy && props.onOpenChange(o)}
      title={props.title}
      description={props.description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button variant="primary" disabled={!clean} loading={busy} onClick={() => void submit()}>{props.confirmLabel}</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label={props.label} hint={props.hint} required>
          <Input value={name} maxLength={props.maxLength} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/** Prazo interno do cartão (data). Vazio e confirmar = remover. */
export function DueDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; reference: string; current?: string; onSubmit: (dueAt: string | null) => Promise<boolean> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (props.open) setValue(isoToDateInput(props.current));
  }, [props.open, props.current]);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await props.onSubmit(value ? dateInputToIso(value) : null);
    setBusy(false);
    if (ok) props.onOpenChange(false);
  };
  return (
    <Modal
      open={props.open}
      onOpenChange={(o) => !busy && props.onOpenChange(o)}
      title={`Prazo interno de ${props.reference}`}
      description="Data prevista de resposta da equipe. Não é o SLA: o ticket passa a aparecer na visão Com prazo interno no quadro."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!value && !props.current} onClick={() => void submit()}>{value ? 'Salvar prazo' : 'Remover prazo'}</Button>
        </>
      }
    >
      <Field label="Data do prazo">
        <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
    </Modal>
  );
}

/** Limite de trabalho em andamento da coluna (aviso, não bloqueia). Vazio = sem limite. */
export function WipDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; columnName: string; current: number | null; onSubmit: (limit: number | null) => Promise<boolean> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (props.open) setValue(props.current ? String(props.current) : '');
  }, [props.open, props.current]);
  const n = value.trim() === '' ? null : Number(value);
  const invalid = n !== null && (!Number.isInteger(n) || n < 1 || n > 999);
  const submit = async () => {
    if (busy || invalid) return;
    setBusy(true);
    const ok = await props.onSubmit(n);
    setBusy(false);
    if (ok) props.onOpenChange(false);
  };
  return (
    <Modal
      open={props.open}
      onOpenChange={(o) => !busy && props.onOpenChange(o)}
      title={`Limite de trabalho em ${props.columnName}`}
      description="Só avisa quando a coluna passa do limite; nunca impede de mover um cartão. Deixe em branco para tirar o limite."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={invalid} onClick={() => void submit()}>Salvar limite</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Máximo de tickets" error={invalid ? 'Use um número inteiro de 1 a 999.' : undefined}>
          <Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
