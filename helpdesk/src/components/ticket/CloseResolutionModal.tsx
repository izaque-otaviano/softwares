import { useEffect, useMemo, useState } from 'react';
import { ticketsApi } from '@/api';
import { Button, Field, Input, Modal } from '@/components/ui';
import { validateResolutionWindow, type ResolutionWindow } from '@/api/real/mappers/outbound';
import { IS_REAL } from '@/api/mode';
import { useFormStore } from './formStore';

/** datetime-local value (local) <-> ISO UTC, alinhado ao minuto. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  const floor = Math.floor(d.getTime() / 60_000) * 60_000;
  return new Date(floor).toISOString();
}

function formatDuration(startedIso: string, endedIso: string): string {
  const ms = Date.parse(endedIso) - Date.parse(startedIso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Diálogo ao fechar ticket no modo real: o backend exige início/término da solução
 * (entra na franquia de horas de manutenção da empresa). Pré-preenche com a sugestão D4.
 */
export function CloseResolutionModal() {
  const pending = useFormStore((s) => s.pendingClose);
  const open = pending !== null && IS_REAL;

  const [startedLocal, setStartedLocal] = useState('');
  const [endedLocal, setEndedLocal] = useState('');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    let alive = true;
    setLoading(true);
    setLoadError(null);
    setStartedLocal('');
    setEndedLocal('');
    setCreatedAt(null);

    const ticketId = pending.key.startsWith('ticket:') ? Number(pending.key.slice(7)) : null;
    if (!ticketId) {
      setLoadError('Ticket inválido.');
      setLoading(false);
      return;
    }

    Promise.all([ticketsApi.getTicket(ticketId), ticketsApi.suggestResolutionWindow(ticketId)])
      .then(([ticket, window]) => {
        if (!alive) return;
        setCreatedAt(ticket.createdAt);
        setStartedLocal(toLocalInput(window.started));
        setEndedLocal(toLocalInput(window.ended));
      })
      .catch((e) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : 'Não foi possível carregar a janela sugerida.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [pending]);

  const window: ResolutionWindow | null = useMemo(() => {
    if (!startedLocal || !endedLocal) return null;
    const started = fromLocalInput(startedLocal);
    const ended = fromLocalInput(endedLocal);
    if (!started || !ended) return null;
    return { started, ended };
  }, [startedLocal, endedLocal]);

  const error =
    window && createdAt ? validateResolutionWindow(window, createdAt) : window === null && !loading ? 'Informe início e término.' : null;

  const duration = window ? formatDuration(window.started, window.ended) : '—';

  const onOpenChange = (next: boolean) => {
    if (!next && !submitting) useFormStore.getState().cancelClose();
  };

  const confirm = async () => {
    if (!pending || !window || error) return;
    setSubmitting(true);
    try {
      const result = await useFormStore.getState().submit(pending.key, pending.statusIdOverride, window);
      if (result.ok) useFormStore.getState().cancelClose();
      // se falhou (api), o formulário já tem apiError; fecha o diálogo para o agente ver o banner
      if (!result.ok && result.kind === 'api') useFormStore.getState().cancelClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Confirmar fechamento"
      description="A janela de solução entra na franquia de horas de manutenção da empresa. Ajuste se necessário."
      size="sm"
      footer={
        <>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={submitting} disabled={loading || Boolean(error) || !window} onClick={() => void confirm()}>
            Fechar ticket
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-fg-muted">Calculando janela sugerida…</p>
      ) : loadError ? (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Início da solução">
            <Input
              id="close-res-start"
              type="datetime-local"
              value={startedLocal}
              onChange={(e) => setStartedLocal(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="Término da solução" error={error ?? undefined}>
            <Input
              id="close-res-end"
              type="datetime-local"
              value={endedLocal}
              onChange={(e) => setEndedLocal(e.target.value)}
              disabled={submitting}
              invalid={Boolean(error)}
            />
          </Field>
          <p className="text-sm text-fg-muted">
            Duração: <span className="font-medium text-fg">{duration}</span>
          </p>
        </div>
      )}
    </Modal>
  );
}
