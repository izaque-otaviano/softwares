import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Database } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/api/backups';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/lists/useAsync';
import { formatBytes, isActiveJob, originLabel, originSource, saveBlob } from '@/components/admin/backups/backupText';
import { JobHistory } from '@/components/admin/backups/JobHistory';
import { JobProgress } from '@/components/admin/backups/JobProgress';
import { RestoreBackupModal } from '@/components/admin/backups/RestoreBackupModal';
import { ScheduleForm } from '@/components/admin/backups/ScheduleForm';
import { ReadOnlyNotice } from '@/components/admin/sla/adminAForm';
import { Banner, Button, ConfirmModal, Pill, Table, Tabs, TabsContent, TabsList, TabsTrigger, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import { SETTINGS_WRITE } from '@/lib/adminAPermissions';
import { errMessage } from '@/lib/apiError';
import { useCan } from '@/lib/permissions';
import { toast } from '@/store/useUi';
import type { BackupFile, BackupJob, BackupOverview } from '@/types/admin-a';

const POLL_MS = 1500;
const when = (iso: string) => format(new Date(iso), 'dd/MM/yyyy HH:mm', { locale: ptBR });

export default function AdminBackups() {
  // Em modo real o backend exige administrador até para LER (`settings.manage`): sem ele a tela só explica.
  const canManage = useCan(SETTINGS_WRITE);
  const overview = useAsync<BackupOverview>(() => api.getBackups());
  const schedule = useAsync(() => api.getBackupSchedule());
  const [job, setJob] = useState<BackupJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [toRestore, setToRestore] = useState<BackupFile | null>(null);
  const [toDelete, setToDelete] = useState<BackupFile | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [tab, setTab] = useState('backups');
  const [pollError, setPollError] = useState<string | null>(null);
  const alive = useRef(true);
  const { reload } = overview;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Retoma o acompanhamento de um backup que já estava rodando quando a tela abriu.
  const running = overview.data?.running ?? null;
  useEffect(() => {
    if (running && !job) setJob(running);
  }, [running, job]);

  // Acompanha o trabalho em andamento (polling) até terminar.
  const jobId = job && isActiveJob(job) ? job.id : null;
  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(() => {
      api
        .getBackupJob(jobId)
        .then((next) => {
          if (!alive.current) return;
          setPollError(null);
          setJob(next);
          if (!isActiveJob(next)) {
            reload();
            if (next.status === 'concluido') toast.success(next.kind === 'restauracao' ? 'Restauração concluída' : 'Backup concluído');
            else toast.error(next.error || 'O trabalho terminou com erro');
          }
        })
        .catch((e: unknown) => alive.current && setPollError(errMessage(e, 'Não foi possível acompanhar o andamento.')));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobId, reload]);

  const createNow = async () => {
    setStarting(true);
    try {
      const started = await api.createBackup();
      setJob(started);
      setTab('backups');
      if (!isActiveJob(started)) {
        reload();
        if (started.status === 'concluido') toast.success('Backup concluído');
      }
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível criar o backup. Tente novamente.'));
    } finally {
      setStarting(false);
    }
  };

  const download = async (f: BackupFile) => {
    setDownloading(f.name);
    try {
      const { blob, fileName } = await api.downloadBackup(f.name);
      saveBlob(blob, fileName);
      toast.success('Download iniciado');
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível baixar o backup. Tente novamente.'));
    } finally {
      setDownloading(null);
    }
  };

  const restore = useCallback(async (f: BackupFile) => {
    const started = await api.restoreBackup(f.name);
    setJob(started);
    setTab('backups');
    toast.info('Restauração iniciada');
  }, []);

  const data = overview.data;
  const busy = isActiveJob(job);
  const lastJob = data?.recent.find((j) => j.kind === 'backup');
  const lastFile = data?.files[0];
  const failed = lastJob && lastJob.status === 'erro';

  const columns: ColumnDef<BackupFile>[] = [
    { id: 'name', header: 'Nome', label: 'Nome', width: 300, cell: (f) => <span className="font-mono text-xs">{f.name}</span> },
    { id: 'date', header: 'Data', label: 'Data', width: 160, cell: (f) => when(f.createdAt) },
    { id: 'size', header: 'Tamanho', label: 'Tamanho', width: 110, align: 'right', cell: (f) => formatBytes(f.sizeBytes) },
    { id: 'type', header: 'Tipo', label: 'Tipo', width: 200, cell: (f) => <Pill tone={f.origin === 'pre_restauracao' ? 'note' : 'neutral'}>{originLabel(f.origin)}</Pill> },
    { id: 'origin', header: 'Origem', label: 'Origem', width: 230, cell: (f) => originSource(f, data?.recent ?? []) },
  ];

  const rowActions = (f: BackupFile): MenuItemSpec[] => [
    { id: 'download', label: downloading === f.name ? 'Baixando...' : 'Baixar', disabled: downloading !== null, onSelect: () => void download(f) },
    { id: 'restore', label: 'Restaurar...', tone: 'danger', disabled: busy, onSelect: () => setToRestore(f) },
    { id: 'delete', label: 'Excluir', tone: 'danger', onSelect: () => setToDelete(f) },
  ];

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Ferramentas' }, { label: 'Backups' }]}
        title="Backups"
        description="Cópias do banco de dados inteiro. Crie, baixe, restaure e agende backups automáticos."
        actions={
          canManage ? (
            <Button variant="ink" leadingIcon={<Database />} onClick={() => void createNow()} loading={starting} disabled={busy}>
              Criar backup agora
            </Button>
          ) : undefined
        }
      />
      {canManage ? null : <ReadOnlyNotice>Backups são restritos a administradores: sem a permissão de configurações do sistema, o servidor não mostra a lista.</ReadOnlyNotice>}
      <div className="space-y-3 px-6 pb-2 pt-3">
        {job && isActiveJob(job) ? <JobProgress job={job} /> : null}
        {pollError ? (
          <Banner tone="warning" title="Acompanhamento interrompido">
            {pollError} O trabalho continua no servidor; atualize a página para ver o resultado.
          </Banner>
        ) : null}
        {job && !isActiveJob(job) && job.status === 'erro' ? (
          <Banner tone="error" title={job.kind === 'restauracao' ? 'A restauração falhou' : 'O backup falhou'} onDismiss={() => setJob(null)}>
            {job.error || 'O servidor não informou o motivo. Veja o log no histórico.'}
          </Banner>
        ) : null}
        {job && !isActiveJob(job) && job.status === 'concluido' && job.kind === 'restauracao' ? (
          <Banner tone="success" title="Restauração concluída" onDismiss={() => setJob(null)}>
            Os dados foram substituídos por {job.fileName}. Recarregue a página e entre de novo se algo parecer desatualizado.
          </Banner>
        ) : null}
        {failed && !(job && !isActiveJob(job) && job.status === 'erro') ? (
          <Banner tone="error" title="O último backup falhou">
            {lastJob.error || 'Veja o log no histórico.'} Tentativa de {when(lastJob.startedAt ?? lastJob.createdAt)}.
          </Banner>
        ) : null}
        {data ? (
          <p className="text-sm text-fg-muted" data-testid="last-backup">
            {lastFile ? (
              <>
                Último backup: <strong className="font-semibold text-fg">{when(lastFile.createdAt)}</strong> ({formatDistanceToNow(new Date(lastFile.createdAt), { locale: ptBR, addSuffix: true })}), {formatBytes(lastFile.sizeBytes)}. Guardados por {data.retentionDays} dias em <span className="font-mono text-xs">{data.directory}</span>.
              </>
            ) : (
              'Nenhum backup guardado ainda.'
            )}
          </p>
        ) : null}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Backups" className="px-6">
          <TabsTrigger value="backups" count={data?.files.length}>
            Backups
          </TabsTrigger>
          <TabsTrigger value="agendamento">Agendamento</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="backups" className="px-6 py-4">
          <Table<BackupFile>
            id="admin-backups"
            aria-label="Arquivos de backup"
            columns={columns}
            rows={data?.files ?? []}
            getRowId={(f) => f.name}
            getRowLabel={(f) => f.name}
            loading={overview.loading && !data}
            error={overview.error ? { message: overview.error, onRetry: overview.reload } : undefined}
            rowActions={canManage ? rowActions : undefined}
            empty={{ title: 'Nenhum backup guardado', description: canManage ? 'Use "Criar backup agora" ou ligue o agendamento.' : undefined }}
          />
        </TabsContent>
        <TabsContent value="agendamento" className="px-6 py-4">
          {schedule.error ? (
            <Banner tone="error" onRetry={schedule.reload}>
              {schedule.error}
            </Banner>
          ) : schedule.data ? (
            <ScheduleForm
              schedule={schedule.data}
              readOnly={!canManage}
              onSave={async (input) => {
                const saved = await api.saveBackupSchedule(input);
                schedule.setData(saved);
                toast.success(saved.enabled ? 'Agendamento salvo' : 'Agendamento desligado');
              }}
            />
          ) : (
            <p className="text-sm text-fg-muted">Carregando agendamento...</p>
          )}
        </TabsContent>
        <TabsContent value="historico" className="px-6 py-4">
          <JobHistory jobs={data?.recent ?? []} loading={overview.loading && !data} />
        </TabsContent>
      </Tabs>
      <RestoreBackupModal file={toRestore} onOpenChange={(o) => !o && setToRestore(null)} onConfirm={restore} />
      <ConfirmModal
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir backup"
        description={toDelete ? `Excluir o arquivo ${toDelete.name}? Ele sai do servidor e não pode ser recuperado.` : undefined}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          const name = toDelete.name;
          try {
            await api.deleteBackup(name);
            overview.setData((prev) => (prev ? { ...prev, files: prev.files.filter((f) => f.name !== name) } : prev!));
            toast.success('Backup excluído');
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível excluir. Tente novamente.'));
            throw e;
          }
        }}
      />
    </div>
  );
}
