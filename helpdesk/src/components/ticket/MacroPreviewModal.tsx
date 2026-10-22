import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { macrosApi } from '@/api';
import { goTo } from '@/components/shell/openTab';
import { Banner, Button, Modal, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { CATEGORY_LABEL, DEFAULT_STATUSES, PRIORITY_LABEL } from '@/lib/status';
import { useTickets } from '@/store/useTickets';
import type { Macro } from '@/types/domain';

interface Props {
  /** `null` = fechado. */
  macro: Macro | null;
  onOpenChange: (open: boolean) => void;
  /** Aplica no formulário (não envia). */
  onApply: (macro: Macro) => void;
}

function Body({ text, note }: { text?: string; note?: boolean }) {
  return (
    <div className={note ? 'min-h-24 whitespace-pre-wrap rounded bg-note-bg p-3 text-sm text-fg' : 'min-h-24 whitespace-pre-wrap rounded border border-line p-3 text-sm text-fg'}>
      {text ? text : <span className="text-fg-muted">Esta macro não tem texto.</span>}
    </div>
  );
}

/** Pré-visualização de macro: Cancelar não altera nada; Aplicar macro só mexe no formulário. */
export function MacroPreviewModal({ macro, onOpenChange, onApply }: Props) {
  const storeStatuses = useTickets((s) => s.statuses);
  const [loaded, setLoaded] = useState<Macro | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const id = macro?.id;

  useEffect(() => {
    setLoaded(null);
    setFailed(false);
    if (!id) return;
    let alive = true;
    macrosApi
      .getMacro(id)
      .then((m) => alive && setLoaded(m))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  const current = loaded ?? null;
  const statuses = storeStatuses.length ? storeStatuses : DEFAULT_STATUSES;
  const status = current?.actions.status ? statuses.find((s) => s.id === current.actions.status) : undefined;
  const a = current?.actions;

  return (
    <Modal
      open={macro !== null}
      onOpenChange={onOpenChange}
      title={macro?.name ?? 'Macro'}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              goTo('/admin/macros');
            }}
            className="mr-auto inline-flex items-center gap-1 rounded text-sm text-action outline-none hover:underline focus-visible:shadow-focus"
          >
            Abrir nas configurações
            <ExternalLink aria-hidden className="h-4 w-4" />
          </button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!current} onClick={() => current && onApply(current)}>
            Aplicar macro
          </Button>
        </>
      }
    >
      {failed ? (
        <Banner tone="error" onRetry={() => setAttempt((n) => n + 1)}>
          Não foi possível carregar a macro.
        </Banner>
      ) : !current ? (
        <div role="status" className="flex gap-6">
          <span className="sr-only">Carregando...</span>
          <div aria-hidden className="flex w-48 flex-col gap-3">
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
          <div aria-hidden className="flex flex-1 flex-col gap-3">
            <Skeleton width="40%" height={32} />
            <Skeleton height={96} />
          </div>
        </div>
      ) : (
        <div className="flex gap-6">
          <div className="w-48 shrink-0 space-y-2 text-sm">
            <p className="text-xs font-semibold text-fg-muted">Categoria do status: {status ? CATEGORY_LABEL[status.category] : 'sem alteração'}</p>
            {status ? <p className="text-fg">Status: {status.agentName}</p> : null}
            {a?.priority ? <p className="text-fg">Prioridade: {PRIORITY_LABEL[a.priority]}</p> : null}
            {a?.addTags?.length ? <p className="text-fg">Tags: {a.addTags.join(', ')}</p> : null}
          </div>
          <Tabs defaultValue={a?.publicReply || !a?.internalNote ? 'public' : 'internal'} className="min-w-0 flex-1">
            <TabsList aria-label="Texto da macro">
              <TabsTrigger value="public">Resposta pública</TabsTrigger>
              <TabsTrigger value="internal">Observação interna</TabsTrigger>
            </TabsList>
            <TabsContent value="public" className="pt-3">
              <Body text={a?.publicReply} />
            </TabsContent>
            <TabsContent value="internal" className="pt-3">
              <Body text={a?.internalNote} note />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Modal>
  );
}
