import { useState } from 'react';
import { usersApi } from '@/api';
import { Banner, Button, Field, Input, Modal } from '@/components/ui';
import type { User } from '@/types/domain';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "+ Adicionar usuário" do campo Solicitante: cria um usuário final mínimo e o devolve. */
export function AddUserModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (user: User) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; api?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Informe o nome.';
    if (!EMAIL.test(email.trim())) next.email = 'Informe um e-mail válido.';
    setErrors(next);
    if (next.name || next.email) return;
    setBusy(true);
    try {
      const user = await usersApi.createUser({ name: name.trim(), email: email.trim() });
      setName('');
      setEmail('');
      onCreated(user);
      onOpenChange(false);
    } catch (e) {
      setErrors({ api: e instanceof Error ? e.message : 'Não foi possível criar o usuário.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar usuário"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Adicionar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail" required error={errors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {errors.api ? (
          <Banner tone="error" onRetry={() => void submit()}>
            {errors.api} O que você digitou foi mantido.
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}
