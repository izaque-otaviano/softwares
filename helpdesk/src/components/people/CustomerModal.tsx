import { useEffect, useState } from 'react';
import { orgsApi, usersApi } from '@/api';
import { IS_REAL } from '@/api/mode';
import { errMessage } from '@/lib/apiError';
import { Banner, Button, Combobox, Field, Input, Modal, TagInput } from '@/components/ui';
import { toast } from '@/store/useUi';
import type { Org, User } from '@/types/domain';
import { EMAIL_RE } from './peopleUtils';

export interface AddCustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: User) => void;
}

/** "Adicionar cliente": nome, e-mail (validado), organização e tags. Cria pela API e avisa por toast. */
export function AddCustomerModal({ open, onOpenChange, onCreated }: AddCustomerModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; org?: string; phone?: string }>({});
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setOrgId(null);
    setTags([]);
    setPhone('');
    setErrors({});
    setApiError(null);
    orgsApi.listOrgs().then(setOrgs).catch(() => {});
  }, [open]);

  const submit = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Informe o nome.';
    if (!email.trim()) next.email = 'Informe o e-mail.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Informe um e-mail válido.';
    // No backend todo cliente pertence a uma organização e tem ao menos um telefone.
    if (IS_REAL && !orgId) next.org = 'Escolha a organização do cliente.';
    if (IS_REAL && !phone.trim()) next.phone = 'Informe um telefone.';
    setErrors(next);
    setApiError(null);
    if (next.name || next.email || next.org || next.phone) return;
    setBusy(true);
    try {
      const existing = await usersApi.listUsers({ query: email.trim() });
      if (existing.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
        setErrors({ email: 'Já existe um usuário com este e-mail.' });
        return;
      }
      const user = await usersApi.createUser({ name: name.trim(), email: email.trim(), orgId: orgId ?? undefined, tags, phone: phone.trim() || undefined });
      toast.success(`Cliente “${user.name}” foi criado`);
      onCreated(user);
      onOpenChange(false);
    } catch (e) {
      // Mantém o modal aberto com o que foi digitado.
      setApiError(`${errMessage(e, 'Não foi possível criar o cliente.')} O que você digitou foi mantido.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar cliente"
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
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {apiError ? (
          <Banner tone="error" onRetry={() => void submit()}>
            {apiError}
          </Banner>
        ) : null}
        <Field label="Nome" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail" required error={errors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Organização" required={IS_REAL} error={errors.org}>
          <Combobox
            value={orgId}
            onValueChange={setOrgId}
            clearable
            placeholder="Selecione uma organização"
            searchPlaceholder="Pesquisar organização"
            options={orgs.map((o) => ({ value: o.id, label: o.name }))}
          />
        </Field>
        {IS_REAL ? (
          <Field label="Telefone" required error={errors.phone} hint="O backend exige ao menos um telefone.">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        ) : null}
        <Field label="Tags" hint={IS_REAL ? 'Tags de cliente ficam somente neste navegador.' : undefined}>
          <TagInput value={tags} onChange={setTags} placeholder="Adicionar tag" />
        </Field>
      </form>
    </Modal>
  );
}
