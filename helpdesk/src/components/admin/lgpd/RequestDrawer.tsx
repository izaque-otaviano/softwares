import { Download } from 'lucide-react';
import { useState } from 'react';
import { downloadDossier, executeRequest, getRequest, listRedactionCandidates, redactField, rejectRequest, verifyRequest } from '@/api/lgpd';
import { useAsync } from '@/components/admin/useAsync';
import { Banner, Button, ConfirmModal, Drawer, Field, Modal, Pill, Skeleton, Textarea } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { toast } from '@/store/useUi';
import type { DataSubjectRequest, RedactionCandidate } from '@/types/admin-b';
import { DetailList } from '../audit/DetailList';
import { dateTime } from '../audit/format';
import { StrongConfirmModal } from '../audit/StrongConfirmModal';
import { canExecute, deadlineText, executeBlockedReason, isOpen, KIND_LABEL, requestIdentifier, STATUS_LABEL, STATUS_TONE, subjectName } from './dsrText';
import { saveBlob } from './saveBlob';

export interface RequestDrawerProps {
  request: DataSubjectRequest | null;
  onClose: () => void;
  onChanged: (r: DataSubjectRequest) => void;
}

export function RequestDrawer({ request, onClose, onChanged }: RequestDrawerProps) {
  return (
    <Drawer open={request !== null} onOpenChange={(o) => !o && onClose()} title={request ? `Pedido ${requestIdentifier(request)}` : 'Pedido'} description={request ? KIND_LABEL[request.kind] : undefined} width="w-full max-w-xl">
      {request ? <RequestBody key={request.id} initial={request} onChanged={onChanged} /> : null}
    </Drawer>
  );
}

const FIELD_LABEL: Record<string, string> = { subject: 'assunto', body: 'mensagem' };
const MODEL_LABEL: Record<string, string> = { ticket: 'Ticket', message: 'Mensagem do ticket' };

function RequestBody({ initial, onChanged }: { initial: DataSubjectRequest; onChanged: (r: DataSubjectRequest) => void }) {
  const detail = useAsync(() => getRequest(initial.id));
  const [local, setLocal] = useState<DataSubjectRequest | null>(null);
  const req = local ?? detail.data ?? initial;
  const update = (r: DataSubjectRequest) => {
    setLocal(r);
    onChanged(r);
  };

  const [verifyNote, setVerifyNote] = useState('');
  const [verifyAsk, setVerifyAsk] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | undefined>();
  const [rejectBusy, setRejectBusy] = useState(false);
  const [executeAsk, setExecuteAsk] = useState(false);
  const [redacting, setRedacting] = useState<RedactionCandidate | null>(null);
  const [downloading, setDownloading] = useState(false);
  const candidates = useAsync(() => listRedactionCandidates(initial.id));

  const identifier = requestIdentifier(req);
  const blocked = executeBlockedReason(req);
  const resultEntries = Object.entries(req.result).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v));

  const download = async () => {
    setDownloading(true);
    try {
      const { blob, filename } = await downloadDossier(req.id);
      saveBlob(blob, filename);
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível baixar o dossiê.'));
    } finally {
      setDownloading(false);
    }
  };

  const submitReject = async () => {
    if (!rejectReason.trim()) {
      setRejectError('Informe o motivo da negativa: a LGPD exige.');
      return;
    }
    setRejectBusy(true);
    setRejectError(undefined);
    try {
      update(await rejectRequest(req.id, rejectReason));
      toast.success('Pedido rejeitado');
      setRejectOpen(false);
    } catch (e) {
      setRejectError(errMessage(e, 'Não foi possível rejeitar o pedido.'));
    } finally {
      setRejectBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={STATUS_TONE[req.status]}>{STATUS_LABEL[req.status]}</Pill>
        {req.isOverdue ? <Pill tone="danger">Prazo vencido</Pill> : null}
      </div>
      {detail.error ? <Banner tone="error" onRetry={detail.reload}>{detail.error}</Banner> : null}
      <DetailList
        items={[
          { label: 'Titular', value: subjectName(req) },
          { label: 'Tipo', value: KIND_LABEL[req.kind] },
          { label: 'Aberto em', value: dateTime(req.createdAt) },
          { label: 'Prazo legal', value: isOpen(req) ? `${dateTime(req.dueAt)} (${deadlineText(req)})` : dateTime(req.dueAt) },
          { label: 'Observações', value: req.notes },
          { label: 'Identidade', value: req.verifiedAt ? `Verificada em ${dateTime(req.verifiedAt)}: ${req.verificationNote}` : 'Ainda não verificada' },
          { label: 'Executado por', value: req.executedByName ? `${req.executedByName}, ${dateTime(req.executedAt)}` : undefined },
          { label: 'Motivo da negativa', value: req.rejectionReason },
        ]}
      />
      {req.error ? <Banner tone="error" title="A execução falhou">{req.error}</Banner> : null}
      {resultEntries.length ? (
        <section aria-labelledby="dsr-result">
          <h3 id="dsr-result" className="mb-1 text-sm font-semibold text-fg">
            O que foi processado
          </h3>
          <DetailList items={resultEntries.map(([k, v]) => ({ label: k, value: String(v) }))} />
        </section>
      ) : null}

      {req.status === 'pending' ? (
        <section aria-labelledby="dsr-verify" className="rounded border border-line p-3">
          <h3 id="dsr-verify" className="text-sm font-semibold text-fg">
            Verificar identidade do titular
          </h3>
          <p className="mt-1 text-sm text-fg-muted">Registre como a identidade foi conferida (documento, videochamada, resposta no e-mail cadastrado). Sem isso a anonimização não pode ser executada.</p>
          <Field label="Como a identidade foi confirmada" required className="mt-3">
            <Textarea value={verifyNote} onChange={(e) => setVerifyNote(e.target.value.slice(0, 250))} />
          </Field>
          <Button className="mt-3" variant="outline" disabled={!verifyNote.trim()} onClick={() => setVerifyAsk(true)}>
            Registrar verificação
          </Button>
        </section>
      ) : null}

      <section aria-labelledby="dsr-candidates">
        <h3 id="dsr-candidates" className="mb-1 text-sm font-semibold text-fg">
          Possíveis dados pessoais em texto livre
        </h3>
        <p className="mb-2 text-sm text-fg-muted">O sistema só sugere trechos para revisão. Nada é redigido sem sua confirmação.</p>
        {candidates.loading ? (
          <Skeleton height={40} />
        ) : candidates.error ? (
          <Banner tone="error" onRetry={candidates.reload}>{candidates.error}</Banner>
        ) : (candidates.data ?? []).length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhum trecho com dado pessoal provável foi encontrado.</p>
        ) : (
          <ul className="space-y-2">
            {candidates.data!.map((c) => (
              <li key={`${c.model}-${c.pk}-${c.field}`} className="flex items-center justify-between gap-3 rounded border border-line p-2 text-sm">
                <span className="min-w-0">
                  {MODEL_LABEL[c.model] ?? c.model} em {c.reference || `#${c.pk}`}, {FIELD_LABEL[c.field] ?? c.field}: possível {c.pattern}
                </span>
                <Button variant="outline" disabled={req.status !== 'approved'} onClick={() => setRedacting(c)} aria-label={`Redigir ${c.pattern} em ${c.reference || c.pk}`}>
                  Redigir
                </Button>
              </li>
            ))}
          </ul>
        )}
        {(candidates.data ?? []).length > 0 && req.status !== 'approved' ? <p className="mt-2 text-xs text-fg-muted">Só é possível redigir depois de verificar a identidade e antes de executar.</p> : null}
      </section>

      <section aria-labelledby="dsr-actions" className="space-y-3 border-t border-line pt-4">
        <h3 id="dsr-actions" className="text-sm font-semibold text-fg">
          Ações
        </h3>
        <div className="flex flex-wrap gap-2">
          {req.hasExport ? (
            <Button variant="outline" leadingIcon={<Download />} loading={downloading} onClick={() => void download()}>
              Baixar dossiê
            </Button>
          ) : null}
          <Button variant="danger" disabled={!canExecute(req)} onClick={() => setExecuteAsk(true)}>
            {req.kind === 'anonymize' ? 'Anonimizar dados' : 'Gerar pacote de dados'}
          </Button>
          <Button variant="outline" disabled={!isOpen(req)} onClick={() => setRejectOpen(true)}>
            Rejeitar pedido
          </Button>
        </div>
        {blocked ? <p className="text-xs text-fg-muted">{blocked}</p> : null}
      </section>

      <ConfirmModal
        open={verifyAsk}
        onOpenChange={setVerifyAsk}
        tone="primary"
        title="Registrar verificação de identidade"
        description="O pedido passa a aprovado, pronto para ser executado. A verificação fica registrada com seu nome e a data."
        confirmLabel="Registrar"
        onConfirm={async () => {
          try {
            update(await verifyRequest(req.id, verifyNote));
            toast.success('Identidade verificada');
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível registrar a verificação.'));
            throw e;
          }
        }}
      />

      <Modal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Rejeitar pedido"
        description="O pedido é encerrado e o titular deve ser informado do motivo. Não dá para reabrir: seria preciso abrir um novo pedido."
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={rejectBusy} onClick={() => void submitReject()}>
              Rejeitar pedido
            </Button>
          </>
        }
      >
        <Field label="Motivo da negativa" required error={rejectError}>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} invalid={Boolean(rejectError)} />
        </Field>
      </Modal>

      <StrongConfirmModal
        open={executeAsk}
        onOpenChange={setExecuteAsk}
        title={req.kind === 'anonymize' ? 'Anonimizar dados do titular' : 'Gerar pacote de dados'}
        identifier={identifier}
        confirmLabel={req.kind === 'anonymize' ? 'Anonimizar definitivamente' : 'Gerar pacote'}
        tone={req.kind === 'anonymize' ? 'danger' : 'primary'}
        consequences={
          req.kind === 'anonymize'
            ? `Esta ação é IRREVERSÍVEL. Os dados pessoais de ${subjectName(req)} serão anonimizados e não há como desfazer nem recuperar o que foi apagado. Confirme que a identidade foi verificada e que o pedido é legítimo.`
            : `Será gerado o pacote de dados de ${subjectName(req)} em segundo plano. Depois disso o dossiê poderá ser baixado.`
        }
        onConfirm={async () => {
          update(await executeRequest(req.id));
          toast.success(req.kind === 'anonymize' ? 'Execução iniciada' : 'Pacote em geração');
        }}
      />

      <StrongConfirmModal
        open={redacting !== null}
        onOpenChange={(o) => !o && setRedacting(null)}
        title="Redigir trecho"
        identifier={identifier}
        confirmLabel="Redigir definitivamente"
        consequences="Esta ação é IRREVERSÍVEL. O conteúdo do campo será substituído por uma marca de redação e o texto original não pode ser recuperado. Confira o trecho no ticket antes de confirmar."
        onConfirm={async () => {
          if (!redacting) return;
          await redactField(req.id, { model: redacting.model, pk: redacting.pk });
          toast.success('Trecho redigido');
          candidates.reload();
        }}
      />
    </div>
  );
}
