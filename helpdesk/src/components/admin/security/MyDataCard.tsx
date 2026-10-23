import { useState } from 'react';
import { listMyDataRequests, requestMyExport } from '@/api/security';
import { useAsync } from '@/components/admin/useAsync';
import { Banner, Button, Pill, Skeleton } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { toast } from '@/store/useUi';
import { dateTime } from '../audit/format';
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE } from '../lgpd/dsrText';

/** Pedidos de exportação dos próprios dados (self-service, LGPD art. 18). Só existe o tipo exportação. */
export function MyDataCard() {
  const { data, loading, error, reload } = useAsync(listMyDataRequests);
  const [busy, setBusy] = useState(false);
  const request = async () => {
    setBusy(true);
    try {
      await requestMyExport();
      toast.success('Pedido de exportação enviado');
      reload();
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível pedir a exportação.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="mydata-title" className="max-w-2xl space-y-3">
      <h2 id="mydata-title" className="text-md font-semibold text-fg">
        Meus dados
      </h2>
      <p className="text-sm text-fg-muted">Peça uma cópia dos seus dados pessoais. O pacote fica disponível para download autenticado por poucos dias. Para pedir exclusão, fale com o suporte: a anonimização não tem volta e passa por conferência.</p>
      <Button variant="outline" loading={busy} onClick={() => void request()}>
        Pedir exportação dos meus dados
      </Button>
      {loading && !data ? <Skeleton height={48} /> : error && !data ? <Banner tone="error" onRetry={reload}>{error}</Banner> : (data ?? []).length === 0 ? <p className="text-sm text-fg-muted">Você ainda não fez nenhum pedido.</p> : (
        <ul className="divide-y divide-line rounded border border-line">
          {data!.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                {KIND_LABEL[r.kind]} em {dateTime(r.createdAt)}
              </span>
              <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
