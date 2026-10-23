import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { ticketsApi } from '@/api';
import type { ResolutionSuggestion } from '@/api/tickets';
import { IS_REAL } from '@/api/mode';
import { validateResolutionWindow } from '@/api/real/mappers/outbound';
import { Banner, Button, Field, Input, Modal } from '@/components/ui';
import { formatDuration, fromLocalInput, toLocalInput } from '@/lib/datetimeLocal';
import { useTickets } from '@/store/useTickets';

const when = (iso: string): string => (iso ? format(new Date(iso), 'dd/MM HH:mm') : '—');
const label = (s: { id: number; reference?: string }): string => s.reference ?? `#${s.id}`;

interface Row extends ResolutionSuggestion {
  /** Término efetivo (o comum, se o agente o editou). */
  endedAt: string;
  error: string | null;
}

/**
 * Confirmação do FECHAMENTO EM LOTE. Cada ticket usa a sua janela sugerida (início = primeira abertura do ciclo atual,
 * senão a criação; término = agora) e o agente pode ajustar o término COMUM. A janela entra na franquia de horas de
 * manutenção da empresa, por isso nada é gravado sem esta confirmação. Falhas por ticket (`failed[]` do backend)
 * ficam na lista, com o motivo, e o lote pode ser reenviado só com elas.
 */
export function BulkCloseModal() {
  const req = useTickets((s) => s.bulkClose);
  const [cache, setCache] = useState<Record<number, ResolutionSuggestion>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commonEnd, setCommonEnd] = useState<string | null>(null); // datetime-local; null = cada um usa o próprio (agora)
  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<string | null>(null);

  const ids = req?.ids;

  // Ao fechar o diálogo, zera tudo: o próximo pedido recalcula as janelas (o "agora" muda). Reenviar só os que falharam
  // mantém o diálogo aberto e, com ele, o que já foi calculado e digitado.
  useEffect(() => {
    if (req) return;
    setCache({});
    setCommonEnd(null);
    setFailures({});
    setSummary(null);
    setLoadError(null);
  }, [req]);

  // Busca as janelas sugeridas só dos tickets que ainda não temos (ao repetir com os que falharam, nada é buscado).
  useEffect(() => {
    if (!ids) return;
    const missing = ids.filter((id) => !cache[id]);
    if (missing.length === 0) return;
    let alive = true;
    setLoading(true);
    setLoadError(null);
    ticketsApi
      .suggestResolutionWindows(missing)
      .then((list) => {
        if (!alive) return;
        setCache((c) => ({ ...c, ...Object.fromEntries(list.map((r) => [r.id, r])) }));
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : 'Não foi possível calcular as janelas sugeridas.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids?.join(','), req === null]);

  const rows: Row[] = useMemo(() => {
    const now = new Date();
    const forcedEnd = commonEnd ? fromLocalInput(commonEnd) : '';
    return (ids ?? []).flatMap((id) => {
      const s = cache[id];
      if (!s) return [];
      const endedAt = forcedEnd || s.ended;
      const error = validateResolutionWindow({ started: s.started, ended: endedAt }, s.createdAt, now);
      return [{ ...s, endedAt, error }];
    });
  }, [ids, cache, commonEnd]);

  const missingCount = (ids?.length ?? 0) - rows.length;
  const invalid = rows.filter((r) => r.error);
  const commonEndInvalid = commonEnd !== null && fromLocalInput(commonEnd) === '';
  const canConfirm = !loading && !submitting && rows.length > 0 && invalid.length === 0 && !commonEndInvalid;
  const defaultEnd = rows[0]?.ended ?? '';

  const close = () => {
    if (!submitting) useTickets.getState().cancelBulkClose();
  };

  const confirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const total = rows.length;
      const res = await useTickets.getState().submitBulkClose(rows.map((r) => ({ id: r.id, started: r.started, ended: r.endedAt })));
      const map = Object.fromEntries(res.failed.map((f) => [f.id, f.message]));
      setFailures(map);
      setSummary(res.failed.length > 0 ? `${res.updated} de ${total} ${total === 1 ? 'ticket fechado' : 'tickets fechados'}. Não foram fechados:` : null);
    } finally {
      setSubmitting(false);
    }
  };

  const n = ids?.length ?? 0;
  const failedNow = Object.keys(failures).length > 0;
  const title = failedNow ? 'Alguns tickets não foram fechados' : n === 1 ? 'Confirmar fechamento do ticket' : `Confirmar fechamento de ${n} tickets`;

  return (
    <Modal
      open={req !== null}
      onOpenChange={(o) => !o && close()}
      title={title}
      description="A janela da solução entra na franquia de horas de manutenção da empresa. Confira antes de fechar."
      size="lg"
      footer={
        <>
          <Button variant="outline" disabled={submitting} onClick={close}>
            {failedNow ? 'Fechar janela' : 'Cancelar'}
          </Button>
          <Button variant="primary" loading={submitting} disabled={!canConfirm} onClick={() => void confirm()}>
            {failedNow ? 'Tentar novamente' : n === 1 ? 'Fechar ticket' : `Fechar ${n} tickets`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {summary ? (
          <Banner tone="error" title={summary}>
            Ajuste o horário e tente de novo, ou feche a janela e trate os tickets abaixo um a um.
          </Banner>
        ) : null}
        {loadError ? <Banner tone="error">{loadError}</Banner> : null}

        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">Política do lote:</span> cada ticket usa a sua janela sugerida. O início é a primeira abertura do ciclo atual
          (ou a criação do ticket, se nunca foi aberto) e o término é agora.
          {!IS_REAL ? ' Modo demonstração: o horário não é gravado.' : ''}
        </p>

        <Field
          label="Término comum (opcional)"
          hint="Vale para todos os tickets do lote. Sem alterar, cada um termina agora."
          error={commonEndInvalid ? 'Informe um horário válido.' : undefined}
          labelAction={
            commonEnd !== null ? (
              <button type="button" onClick={() => setCommonEnd(null)} disabled={submitting} className="text-sm text-action underline-offset-2 hover:underline focus-visible:shadow-focus">
                Usar agora
              </button>
            ) : undefined
          }
        >
          <Input
            type="datetime-local"
            value={commonEnd ?? toLocalInput(defaultEnd)}
            onChange={(e) => setCommonEnd(e.target.value)}
            disabled={submitting || loading || rows.length === 0}
            invalid={commonEndInvalid}
            className="max-w-xs"
          />
        </Field>

        {loading && rows.length === 0 ? (
          <p className="text-sm text-fg-muted">Calculando as janelas sugeridas…</p>
        ) : (
          <div className="overflow-hidden rounded border border-line">
            <ul aria-label="Janela de cada ticket" className="max-h-72 divide-y divide-line overflow-y-auto">
              {rows.map((r) => {
                const reason = failures[r.id] ?? r.error;
                return (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
                    <span className="shrink-0 whitespace-nowrap font-medium text-fg">{label(r)}</span>
                    <span className="min-w-0 flex-1 truncate text-fg-muted">{r.subject}</span>
                    <span className="w-full shrink-0 whitespace-nowrap text-xs text-fg-muted tabular-nums sm:w-auto">
                      {when(r.started)} → {when(r.endedAt)} <span className="text-fg">({formatDuration(r.started, r.endedAt)})</span>
                    </span>
                    {reason ? (
                      <p role={failures[r.id] ? 'alert' : undefined} className="basis-full text-xs text-danger">
                        {reason}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {missingCount > 0 && !loading ? (
          <p className="text-xs text-fg-muted">
            {missingCount === 1 ? '1 ticket não pôde ser carregado e ficou fora do lote.' : `${missingCount} tickets não puderam ser carregados e ficaram fora do lote.`}
          </p>
        ) : null}
        {req && req.skippedIds.length > 0 ? (
          <p className="text-xs text-fg-muted">
            {req.skippedIds.length === 1 ? '1 ticket já estava fechado e foi ignorado.' : `${req.skippedIds.length} tickets já estavam fechados e foram ignorados.`}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
