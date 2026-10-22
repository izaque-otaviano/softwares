import { useEffect, useState } from 'react';
import { orgsApi } from '@/api';
import { Banner, Button, Field, Input, Modal, TagInput } from '@/components/ui';
import { toast } from '@/store/useUi';
import type { Org } from '@/types/domain';

export interface AddOrgModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (org: Org) => void;
}

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** "Adicionar organização": nome, domínios e tags. */
export function AddOrgModal({ open, onOpenChange, onCreated }: AddOrgModalProps) {
  const [name, setName] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDomains([]);
    setTags([]);
    setError(undefined);
    setApiError(null);
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setError('Informe o nome da organização.');
      return;
    }
    setError(undefined);
    setApiError(null);
    setBusy(true);
    try {
      const org = await orgsApi.createOrg({ name: name.trim(), domains, tags });
      toast.success(`Organização “${org.name}” foi criada`);
      onCreated(org);
      onOpenChange(false);
    } catch {
      setApiError('Não foi possível criar a organização. O que você digitou foi mantido.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar organização"
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
        <Field label="Nome" required error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Domínios" hint="Ex.: empresa.com.br">
          <TagInput value={domains} onChange={setDomains} placeholder="Adicionar domínio" validate={(d) => (DOMAIN_RE.test(d) ? null : 'Informe um domínio válido.')} />
        </Field>
        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} placeholder="Adicionar tag" />
        </Field>
      </form>
    </Modal>
  );
}
