import { X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useDirectory } from '@/components/lists/useDirectory';
import { Avatar, Combobox, Field, Input, TagInput, type ComboOption } from '@/components/ui';
import { EMAIL_RE, MAX_CC, ticketCcList, ticketFollowerList } from '@/lib/ticketContacts';
import { useMeId } from '@/store/useSession';
import { useTickets } from '@/store/useTickets';
import type { Ticket, User } from '@/types/domain';
import { useFormEntry, useFormStore } from './formStore';

/**
 * CC de terceiros e seguidores.
 *
 * Ticket existente: cada mudança grava NA HORA (`POST|DELETE cc/` e `followers/`), porque o servidor valida (e-mail
 * inválido, o do solicitante, limite de 20, cliente de outra empresa) e o erro precisa aparecer no campo certo. A
 * resposta devolve o ticket atualizado, que entra na store, e o formulário só acompanha (`syncRelations`).
 * Ticket novo: a lista fica no formulário e é gravada logo depois da criação.
 */

const CHIP = 'inline-flex h-6 max-w-full items-center gap-1 rounded bg-surface-2 pl-1.5 pr-1 text-xs text-fg';
const CHIP_X = 'flex size-4 shrink-0 items-center justify-center rounded-xs text-fg-muted hover:bg-hover focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-50';

/** Primeira mensagem de erro de um campo (400 por campo) ou a mensagem geral. */
export const fieldMessage = (e: unknown, field: string): string => {
  const err = e as { fieldErrors?: Record<string, string[]>; message?: string };
  return err.fieldErrors?.[field]?.[0] ?? err.message ?? 'Não foi possível concluir. Tente novamente.';
};

function useTicketOf(ticketKey: string): { ticket: Ticket | undefined; isNew: boolean } {
  const entry = useFormEntry(ticketKey);
  const id = entry?.ticketId ?? null;
  const ticket = useTickets((s) => (id !== null ? s.tickets.find((t) => t.id === id) : undefined));
  return { ticket, isNew: !entry || entry.isNew || !ticket };
}

/** Linha "CC" do compositor. */
export function CcField({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey)!;
  const users = useDirectory();
  const { ticket, isNew } = useTicketOf(ticketKey);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isNew || !ticket) {
    const staged = entry.values.ccIds.map((v) => users.get(v)?.email ?? v);
    return (
      <div className="min-w-0 flex-1">
        <TagInput
          aria-label="CC (e-mails)"
          placeholder="Adicionar e-mails"
          value={staged}
          onChange={(emails) => useFormStore.getState().patch(ticketKey, { ccIds: emails })}
          validate={(t) => (EMAIL_RE.test(t) ? null : 'Informe um e-mail válido')}
          suggestions={[...users.values()].filter((u) => u.role !== 'agent').slice(0, 20).map((u) => u.email)}
        />
      </div>
    );
  }

  const list = ticketCcList(ticket, (id) => users.get(id));
  const run = async (work: () => Promise<Ticket>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const updated = await work();
      useFormStore.getState().syncRelations(ticketKey, updated);
      return true;
    } catch (e) {
      setError(fieldMessage(e, 'email'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const email = value.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) return setError('Informe um e-mail válido.');
    if (list.some((c) => c.email.toLowerCase() === email)) return setError('Este e-mail já está em cópia.');
    if (list.length >= MAX_CC) return setError(`Um ticket aceita no máximo ${MAX_CC} e-mails em cópia.`);
    if (await run(() => useTickets.getState().addCc(ticket.id, { email }))) setValue('');
  };

  return (
    <div className="min-w-0 flex-1" data-testid="cc-field">
      {list.length > 0 ? (
        <ul aria-label="E-mails em cópia" className="mb-1.5 flex flex-wrap gap-1">
          {list.map((c) => (
            <li key={c.id} className={CHIP}>
              <span className="truncate">{c.name ? `${c.name} · ${c.email}` : c.email}</span>
              <button type="button" disabled={busy} aria-label={`Remover ${c.email} do CC`} className={CHIP_X} onClick={() => void run(() => useTickets.getState().removeCc(ticket.id, c.id))}>
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={(e) => void add(e)}>
        <Input
          aria-label="CC (e-mails)"
          aria-describedby={error ? `cc-error-${ticket.id}` : undefined}
          placeholder="Adicionar e-mail e pressionar Enter"
          inputMode="email"
          value={value}
          invalid={Boolean(error)}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
      </form>
      {error ? (
        <p id={`cc-error-${ticket.id}`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-fg-muted">
        {list.length} de {MAX_CC}. Recebem por e-mail cada resposta pública, nunca as notas internas.
      </p>
    </div>
  );
}

function userOption(u: User): ComboOption {
  return { value: u.id, label: u.name, description: u.email, icon: <Avatar name={u.name} size={20} decorative /> };
}

const LINK = 'rounded text-xs font-normal text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none';

/** Campo "Seguidores" do painel de propriedades (mais as pessoas que já seguem). */
export function FollowersField({ ticketKey, disabled }: { ticketKey: string; disabled: boolean }) {
  const entry = useFormEntry(ticketKey)!;
  const users = useDirectory();
  const meId = useMeId();
  const { ticket, isNew } = useTicketOf(ticketKey);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const followerIds = isNew || !ticket ? entry.values.followerIds : ticket.followerIds;

  // Equipe e, quando o servidor aceita, clientes da mesma empresa do solicitante.
  const requesterOrg = ticket ? (users.get(ticket.requesterId)?.orgId ?? ticket.orgId) : undefined;
  const options = useMemo(
    () => [...users.values()].filter((u) => !followerIds.includes(u.id) && (u.role !== 'end_user' || (requesterOrg !== undefined && u.orgId === requesterOrg && u.id !== ticket?.requesterId))).map(userOption),
    [users, followerIds, requesterOrg, ticket?.requesterId],
  );

  const change = async (work: () => Promise<Ticket>, stage: () => void) => {
    if (isNew || !ticket) return stage();
    setBusy(true);
    setError(null);
    try {
      useFormStore.getState().syncRelations(ticketKey, await work());
    } catch (e) {
      setError(fieldMessage(e, 'user_id'));
    } finally {
      setBusy(false);
    }
  };
  const add = (id: string) => change(() => useTickets.getState().addFollower(ticket!.id, id), () => useFormStore.getState().patch(ticketKey, { followerIds: [...followerIds, id] }));

  return (
    <Field
      label="Seguidores"
      error={error ?? undefined}
      labelAction={
        !followerIds.includes(meId) && !disabled && !busy ? (
          <button type="button" className={LINK} onClick={() => void add(meId)}>
            seguir
          </button>
        ) : null
      }
    >
      <Combobox value={null} disabled={disabled || busy} options={options} placeholder="Adicionar seguidores" searchPlaceholder="Buscar pessoas" onValueChange={(v) => v && void add(v)} />
    </Field>
  );
}

export function FollowerChips({ ticketKey, disabled }: { ticketKey: string; disabled: boolean }) {
  const entry = useFormEntry(ticketKey)!;
  const users = useDirectory();
  const { ticket, isNew } = useTicketOf(ticketKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list =
    isNew || !ticket
      ? ticketFollowerList({ followerList: undefined, followerIds: entry.values.followerIds }, (id) => users.get(id))
      : ticketFollowerList(ticket, (id) => users.get(id));
  if (list.length === 0) return null;

  const remove = async (id: string) => {
    if (isNew || !ticket) {
      useFormStore.getState().patch(ticketKey, { followerIds: entry.values.followerIds.filter((x) => x !== id) });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      useFormStore.getState().syncRelations(ticketKey, await useTickets.getState().removeFollower(ticket.id, id));
    } catch (e) {
      setError(fieldMessage(e, 'user_id'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="-mt-2">
      <ul className="flex flex-wrap gap-1" aria-label="Seguidores atuais">
        {list.map((f) => (
          <li key={f.id} className={CHIP}>
            <Avatar name={f.name} size={16} decorative />
            <span className="truncate" title={f.email || undefined}>
              {f.name}
            </span>
            <button type="button" disabled={disabled || busy} aria-label={`Remover ${f.name}`} className={CHIP_X} onClick={() => void remove(f.id)}>
              <X aria-hidden="true" className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
