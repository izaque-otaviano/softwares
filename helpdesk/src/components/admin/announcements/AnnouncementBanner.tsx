import { useCallback, useEffect, useState } from 'react';
import * as api from '@/api/announcements';
import { Banner, type BannerTone } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { toast } from '@/store/useUi';
import type { Announcement, AnnouncementKind } from '@/types/admin-a';
import { KIND_LABEL } from './announcementText';

const TONE: Record<AnnouncementKind, BannerTone> = { info: 'info', urgent: 'error', holiday: 'warning', vacation: 'info' };

export interface AnnouncementBannerProps {
  /** Máximo de avisos mostrados de uma vez (os fixados e urgentes primeiro). Padrão 2. */
  max?: number;
  className?: string;
}

/**
 * Avisos vigentes PARA O USUÁRIO LOGADO (o backend já filtra pela audiência), dispensáveis um a um.
 * Sem aviso, erro ou carregando, não renderiza nada: é seguro plugar em qualquer layout (ex.: topo da área do agente).
 */
export function AnnouncementBanner({ max = 2, className }: AnnouncementBannerProps) {
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .listAnnouncements()
      .then((list) => alive && setItems(list.filter((a) => !a.dismissed)))
      .catch(() => {
        // aviso é conforto: se falhar, a tela segue sem ele
      });
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = useCallback(async (a: Announcement) => {
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    try {
      await api.dismissAnnouncement(a.id);
    } catch (e) {
      setItems((prev) => [a, ...prev]);
      toast.error(errMessage(e, 'Não foi possível dispensar o aviso. Tente novamente.'));
    }
  }, []);

  const shown = [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.kind === 'urgent') - Number(a.kind === 'urgent')).slice(0, max);
  if (shown.length === 0) return null;

  return (
    <section aria-label="Avisos" className={className}>
      <ul className="space-y-2">
        {shown.map((a) => (
          <li key={a.id}>
            <Banner tone={TONE[a.kind]} title={`${KIND_LABEL[a.kind]}: ${a.title}`} onDismiss={() => void dismiss(a)}>
              <span className="whitespace-pre-line">{a.body}</span>
            </Banner>
          </li>
        ))}
      </ul>
    </section>
  );
}
