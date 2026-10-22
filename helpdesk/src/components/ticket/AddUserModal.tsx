import { useEffect, useState } from 'react';
import { orgsApi, usersApi } from '@/api';
import { IS_REAL } from '@/api/mode';
import { Banner, Button, Combobox, Field, Input, Modal } from '@/components/ui';
import type { Org, User } from '@/types/domain';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "+ Adicionar usuário" do campo Solicitante: cria um usuário final mínimo e o devolve. */
export function AddUserModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (user: User) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [errors, setErrors] = useState<{ name?: string; email?: string; org?: string; phone?: string; api?: string }>({});
  // O backend exige organização e telefone para criar um cliente.
  useEffect(() => {
    if (open && IS_REAL) orgsApi.listOrgs().then(setOrgs).catch(() => {});
  }, [open]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Informe o nome.';
    if (!EMAIL.test(email.trim())) next.email = 'Informe um e-mail válido.';
    if (IS_REAL && !orgId) next.org = 'Escolha a organização.';
    if (IS_REAL && !phone.trim()) next.phone = 'Informe um telefone.';
    setErrors(next);
    if (next.name || next.email || next.org || next.phone) return;
    setBusy(true);
    try {
      const user = await usersApi.createUser({ name: name.trim(), email: email.trim(), orgId: orgId ?? undefined, phone: phone.trim() || undefined });
      setName('');
      setEmail('');
      setPhone('');
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
        {IS_REAL ? (
          <>
            <Field label="Organização" required error={errors.org}>
              <Combobox value={orgId} onValueChange={setOrgId} placeholder="Selecione uma organização" searchPlaceholder="Pesquisar organização" options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
            </Field>
            <Field label="Telefone" required error={errors.phone} hint="O backend exige ao menos um telefone.">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </>
        ) : null}
        {errors.api ? (
          <Banner tone="error" onRetry={() => void submit()}>
            {errors.api} O que você digitou foi mantido.
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}
