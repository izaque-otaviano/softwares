import { useMemo, useState } from 'react';
import * as api from '@/api/announcements';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/lists/useAsync';
import { AnnouncementDrawer } from '@/components/admin/announcements/AnnouncementDrawer';
import { audienceSummary, KIND_LABEL, STATE_LABEL, stateOf, whenText, type AnnouncementState } from '@/components/admin/announcements/announcementText';
import { ReadOnlyNotice } from '@/components/admin/sla/adminAForm';
import { Button, ConfirmModal, Input, Pill, Select, Table, type ColumnDef, type MenuItemSpec, type PillTone } from '@/components/ui';
import { Search } from 'lucide-react';
import { ANNOUNCEMENT_WRITE } from '@/lib/adminAPermissions';
import { errMessage } from '@/lib/apiError';
import { useCan } from '@/lib/permissions';
import { toast } from '@/store/useUi';
import type { Announcement, AnnouncementInput } from '@/types/admin-a';

const STATE_TONE: Record<AnnouncementState, PillTone> = { vigente: 'action', agendado: 'note', encerrado: 'neutral', desativado: 'neutral' };
const norm = (s: string) => s.toLocaleLowerCase('pt-BR');

export default function AdminAnnouncements() {
  const canManage = useCan(ANNOUNCEMENT_WRITE);
  const [history, setHistory] = useState('current');
  // Quem gerencia vê todos os avisos (de qualquer público); os demais só os da própria audiência.
  const { data, loading, error, reload, setData } = useAsync(() => api.listAnnouncements({ manage: canManage, history: canManage }));
  const refs = useAsync(() => api.getAudienceRefs());
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [toDeactivate, setToDeactivate] = useState<Announcement | null>(null);

  const rows = useMemo(() => {
    const q = norm(query.trim());
    return (data ?? []).filter((a) => history === 'all' || !canManage || stateOf(a) === 'vigente').filter((a) => !q || norm(`${a.title} ${a.body}`).includes(q));
  }, [data, query, history, canManage]);

  const audienceRefs = refs.data ?? { teams: [], companies: [], plans: [] };

  const save = async (input: AnnouncementInput) => {
    const saved = await api.saveAnnouncement(input);
    setData((prev) => {
      const list = prev ?? [];
      return list.some((a) => a.id === saved.id) ? list.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...list];
    });
    toast.success(input.id ? 'Aviso atualizado' : 'Aviso criado');
  };

  const reactivate = async (a: Announcement) => {
    try {
      const saved = await api.saveAnnouncement({ ...a, active: true });
      setData((prev) => (prev ?? []).map((x) => (x.id === saved.id ? saved : x)));
      toast.success('Aviso ativado');
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível ativar o aviso. Tente novamente.'));
    }
  };

  const columns: ColumnDef<Announcement>[] = [
    {
      id: 'title',
      header: 'Título',
      label: 'Título',
      width: 300,
      cell: (a) => (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(a)} className="truncate rounded-xs text-left text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
            {a.title}
          </button>
          {a.pinned ? <Pill tone="note">Fixado</Pill> : null}
        </span>
      ),
    },
    { id: 'kind', header: 'Tipo', label: 'Tipo', width: 150, cell: (a) => KIND_LABEL[a.kind] },
    { id: 'audience', header: 'Quem vê', label: 'Quem vê', width: 260, cell: (a) => audienceSummary(a, audienceRefs) },
    { id: 'period', header: 'Vigência', label: 'Vigência', width: 260, cell: (a) => `${whenText(a.startsAt)} até ${a.endsAt ? whenText(a.endsAt) : 'sem fim'}` },
    { id: 'state', header: 'Situação', label: 'Situação', width: 130, cell: (a) => <Pill tone={STATE_TONE[stateOf(a)]}>{STATE_LABEL[stateOf(a)]}</Pill> },
    { id: 'by', header: 'Criado por', label: 'Criado por', width: 160, cell: (a) => a.createdBy ?? '—' },
  ];

  const rowActions = (a: Announcement): MenuItemSpec[] =>
    canManage
      ? [
          { id: 'edit', label: 'Editar', onSelect: () => setEditing(a) },
          a.active ? { id: 'deactivate', label: 'Desativar', tone: 'danger' as const, onSelect: () => setToDeactivate(a) } : { id: 'activate', label: 'Ativar', onSelect: () => void reactivate(a) },
        ]
      : [{ id: 'view', label: 'Ver aviso', onSelect: () => setEditing(a) }];

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Avisos' }]}
        title="Avisos"
        description="Mural de avisos para a equipe e para os clientes, com público e período de vigência. Aviso não é apagado: ao desativar, ele sai do ar e fica no histórico."
        actions={
          canManage ? (
            <Button variant="ink" onClick={() => setEditing('new')}>
              Novo aviso
            </Button>
          ) : undefined
        }
      />
      {canManage ? null : <ReadOnlyNotice>Você vê os avisos destinados a você. Só quem tem a permissão de publicar avisos (administradores e supervisores) cria ou edita.</ReadOnlyNotice>}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <Input type="search" aria-label="Pesquisar avisos" placeholder="Pesquisar" value={query} onChange={(e) => setQuery(e.target.value)} leadingIcon={<Search />} className="w-64" />
        {canManage ? (
          <Select
            aria-label="Período"
            value={history}
            onValueChange={setHistory}
            options={[
              { value: 'current', label: 'Vigentes agora' },
              { value: 'all', label: 'Todos, com histórico' },
            ]}
            className="w-52"
          />
        ) : null}
      </div>
      <div className="px-6 pb-6">
        <Table<Announcement>
          id="admin-announcements"
          aria-label="Avisos"
          columns={columns}
          rows={rows}
          getRowId={(a) => a.id}
          getRowLabel={(a) => a.title}
          loading={loading}
          error={error ? { message: error, onRetry: reload } : undefined}
          rowActions={rowActions}
          empty={{ title: 'Nenhum aviso encontrado', description: canManage ? 'Crie um aviso ou veja o histórico.' : undefined, action: canManage ? <Button variant="ink" onClick={() => setEditing('new')}>Novo aviso</Button> : undefined }}
        />
      </div>
      <AnnouncementDrawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} announcement={editing === 'new' ? null : editing} refs={audienceRefs} readOnly={!canManage} onSave={save} />
      <ConfirmModal
        open={toDeactivate !== null}
        onOpenChange={(o) => !o && setToDeactivate(null)}
        title="Desativar aviso"
        description={toDeactivate ? `Desativar "${toDeactivate.title}"? Ele deixa de aparecer para o público, mas continua no histórico e pode ser ativado de novo.` : undefined}
        confirmLabel="Desativar"
        tone="danger"
        onConfirm={async () => {
          if (!toDeactivate) return;
          const id = toDeactivate.id;
          try {
            await api.deactivateAnnouncement(id);
            setData((prev) => (prev ?? []).map((a) => (a.id === id ? { ...a, active: false } : a)));
            toast.success('Aviso desativado');
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível desativar. Tente novamente.'));
            throw e;
          }
        }}
      />
    </div>
  );
}
