import { useEffect, useState } from 'react';
import { Banner, Button, Combobox, ConfirmModal, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import type { Chat, ChatCloseReason, ChatConfig, CloseChatInput } from '@/types/chat';
import type { Group, User } from '@/types/domain';

const NOTE_MAX = 2000;

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: Chat;
}

/** Transferir para outro agente (com observação interna opcional, que vai só para a auditoria). */
export function TransferModal({ open, onOpenChange, chat, agents, meId, onConfirm }: BaseProps & { agents: User[]; meId: string | null; onConfirm: (agentId: string, note: string) => Promise<boolean> }) {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setAgentId(null);
      setNote('');
      setError('');
    }
  }, [open]);
  const options = agents
    .filter((a) => a.id !== meId && a.id !== chat.agentId)
    .map((a) => ({ value: a.id, label: a.name, description: a.role === 'admin' ? 'Administrador' : a.internalRole === 'supervisor' ? 'Supervisor' : 'Agente' }));

  const submit = async () => {
    if (!agentId) {
      setError('Escolha para quem transferir.');
      return;
    }
    setBusy(true);
    try {
      if (await onConfirm(agentId, note.trim())) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Transferir conversa"
      description={`A conversa com ${chat.clientName} passa para outro agente, sem voltar à fila. O cliente é avisado por uma mensagem de sistema.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Transferir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Transferir para" required error={error}>
          <Combobox
            value={agentId}
            onValueChange={(v) => {
              setAgentId(v);
              setError('');
            }}
            options={options}
            placeholder="Escolha um agente"
            searchPlaceholder="Buscar agente"
            emptyText="Nenhum agente disponível."
          />
        </Field>
        <Field label="Observação interna" hint="Só a equipe vê. Fica no histórico do atendimento, não na conversa.">
          <Textarea value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} minRows={3} />
        </Field>
        <Banner tone="info">O agente que recebe precisa estar abaixo do limite de chats simultâneos.</Banner>
      </div>
    </Modal>
  );
}

/** Encerrar com motivo (do cadastro) e observação interna, obrigatória quando o motivo exige. */
export function CloseModal({ open, onOpenChange, chat, reasons, config, onConfirm }: BaseProps & { reasons: ChatCloseReason[]; config: ChatConfig | null; onConfirm: (input: CloseChatInput) => Promise<boolean> }) {
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  const [score, setScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ reason?: string; note?: string; score?: string }>({});
  useEffect(() => {
    if (open) {
      setReasonId('');
      setNote('');
      setScore('');
      setErrors({});
    }
  }, [open]);
  const active = reasons.filter((r) => r.active);
  const reason = active.find((r) => r.id === reasonId);
  const min = config?.scoreMin ?? 0;
  const max = config?.scoreMax ?? 10;

  const submit = async () => {
    const next: typeof errors = {};
    if (active.length > 0 && !reason) next.reason = 'Escolha o motivo do encerramento.';
    if (reason?.requiresNote && !note.trim()) next.note = `O motivo "${reason.name}" pede uma observação interna.`;
    if (score.trim()) {
      const n = Number(score);
      if (!Number.isInteger(n) || n < min || n > max) next.score = `Use um número inteiro de ${min} a ${max}.`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const ok = await onConfirm({ reasonId: reason?.id ?? null, note: note.trim(), agentScore: score.trim() ? Number(score) : null });
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Encerrar conversa"
      description={`Encerrar a conversa com ${chat.clientName}? O cliente será convidado a avaliar o atendimento.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void submit()}>
            Encerrar conversa
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Motivo do encerramento" required={active.length > 0} error={errors.reason} hint={active.length === 0 ? 'Nenhum motivo cadastrado. Um administrador pode cadastrar em Configurações.' : undefined}>
          <Select
            value={reasonId || undefined}
            onValueChange={(v) => {
              setReasonId(v);
              setErrors((e) => ({ ...e, reason: undefined, note: undefined }));
            }}
            options={active.map((r) => ({ value: r.id, label: r.requiresNote ? `${r.name} (pede observação)` : r.name }))}
            placeholder="Escolha um motivo"
            disabled={active.length === 0}
          />
        </Field>
        <Field label="Observação interna" required={Boolean(reason?.requiresNote)} error={errors.note} hint="Só a equipe vê. O cliente nunca recebe esta observação.">
          <Textarea value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} minRows={3} />
        </Field>
        <Field label={`Sua nota para o atendimento (${min} a ${max}, opcional)`} error={errors.score} hint="Interna: o cliente não vê.">
          <Input type="number" inputMode="numeric" min={min} max={max} value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Converter em ticket: escolhe a equipe; a conversa é encerrada junto e a transcrição vai para o ticket. */
export function ConvertModal({ open, onOpenChange, chat, teams, defaultTeamId, onConfirm }: BaseProps & { teams: Group[]; defaultTeamId: string | null; onConfirm: (teamId: string) => Promise<boolean> }) {
  const [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setTeamId(defaultTeamId && teams.some((t) => t.id === defaultTeamId) ? defaultTeamId : '');
      setError('');
    }
  }, [open, defaultTeamId, teams]);

  const submit = async () => {
    if (!teamId) {
      setError('Escolha a equipe que vai receber o ticket.');
      return;
    }
    setBusy(true);
    try {
      if (await onConfirm(teamId)) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Converter em ticket"
      description={`Cria um ticket com a transcrição da conversa com ${chat.clientName}.${chat.status === 'closed' ? '' : ' A conversa é encerrada junto e o cliente não precisa avaliá-la.'}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Converter em ticket
          </Button>
        </>
      }
    >
      <Field label="Equipe do ticket" required error={error}>
        <Select
          value={teamId || undefined}
          onValueChange={(v) => {
            setTeamId(v);
            setError('');
          }}
          options={teams.map((t) => ({ value: t.id, label: t.name }))}
          placeholder="Escolha a equipe"
        />
      </Field>
    </Modal>
  );
}

/** Reabrir: a conversa volta para a fila (o relógio de espera recomeça). */
export function ReopenModal({ open, onOpenChange, chat, onConfirm }: BaseProps & { onConfirm: (note: string) => Promise<boolean> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setNote('');
  }, [open]);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Reabrir conversa"
      description={`A conversa com ${chat.clientName} volta para a fila, e qualquer agente pode pegá-la. O histórico é mantido.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (await onConfirm(note.trim())) onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            Reabrir conversa
          </Button>
        </>
      }
    >
      <Field label="Motivo da reabertura" hint="Opcional. Só a equipe vê, no histórico do atendimento.">
        <Textarea value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} minRows={3} />
      </Field>
    </Modal>
  );
}

/** Exportar com notas internas leva texto que o cliente nunca viu para fora do sistema: pede confirmação. */
export function ExportNotesConfirm({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: () => Promise<void> }) {
  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title="Exportar com notas internas?"
      description="O PDF vai incluir as notas internas, que o cliente nunca vê, e fica identificado como interno. A exportação é registrada na auditoria. Não compartilhe o arquivo com o cliente."
      confirmLabel="Exportar com notas"
      tone="primary"
      onConfirm={onConfirm}
    />
  );
}
