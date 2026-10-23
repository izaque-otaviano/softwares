import { Plus, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IS_REAL } from '@/api/mode';
import { BoardCardView } from '@/components/board/BoardCardView';
import { BoardColumnView, type DropSpot } from '@/components/board/BoardColumnView';
import { DueDialog, NameDialog, WipDialog } from '@/components/board/BoardDialogs';
import { buildColumns, countActiveFilters, stageColumnOf } from '@/components/board/boardModel';
import { openTicket } from '@/components/shell/openTab';
import { Banner, Button, ConfirmModal, EmptyState, IconButton, Input, Kebab, Select, Skeleton, Switch, type MenuItemSpec } from '@/components/ui';
import { useCan } from '@/lib/permissions';
import { PRIORITY_LABEL } from '@/lib/status';
import { startBoardLive, useBoard } from '@/store/board';
import type { BoardCard, BoardColumn } from '@/types/board';
import type { Priority } from '@/types/domain';

type Dialog =
  | { kind: 'new-board' }
  | { kind: 'rename-board' }
  | { kind: 'delete-board' }
  | { kind: 'new-lane' }
  | { kind: 'rename-lane'; column: BoardColumn }
  | { kind: 'delete-lane'; column: BoardColumn }
  | { kind: 'wip'; column: BoardColumn }
  | { kind: 'due'; card: BoardCard }
  | null;

const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low'];

export default function Board() {
  const s = useBoard();
  const canMove = useCan('kanban.move');
  const canConfigure = useCan('settings.manage');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<DropSpot | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const focusAfter = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (useBoard.getState().boardsPhase === 'idle') void useBoard.getState().loadBoards();
    return startBoardLive();
  }, []);

  // Depois de mover por teclado o cartão troca de coluna (outro elemento): devolve o foco a ele.
  useEffect(() => {
    const id = focusAfter.current;
    if (id == null) return undefined;
    const timer = setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-card-open="${id}"]`)?.focus();
      focusAfter.current = null;
    }, 60);
    return () => clearTimeout(timer);
  }, [s.data, s.localOrder]);

  const board = s.boards.find((b) => b.id === s.activeId);
  const views = useMemo(() => (s.data && s.activeId != null ? buildColumns(s.data, s.filters, s.localOrder[s.activeId]) : []), [s.data, s.filters, s.localOrder, s.activeId]);
  const filterCount = countActiveFilters(s.filters);
  const filtered = filterCount > 0;

  const options = useMemo(() => {
    const cards = s.data?.cards ?? [];
    const assignees = new Map<string, string>();
    const companies = new Set<string>();
    for (const c of cards) {
      if (c.assigneeId && c.assigneeName) assignees.set(c.assigneeId, c.assigneeName);
      if (c.companyName) companies.add(c.companyName);
    }
    return {
      assignees: [...assignees].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')),
      companies: [...companies].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  }, [s.data]);

  const announce = useCallback((text: string) => setAnnouncement(text), []);

  const move = useCallback(
    async (card: BoardCard, columnKey: string, beforeId?: number | null) => {
      const data = useBoard.getState().data;
      const target = data?.columns.find((c) => c.key === columnKey);
      focusAfter.current = card.ticketId;
      const ok = await useBoard.getState().moveCard(card.ticketId, columnKey, beforeId);
      if (ok && target) announce(`${card.reference} movido para ${target.name}.`);
      else if (!ok) announce(`${card.reference} não foi movido e voltou para onde estava.`);
    },
    [announce],
  );

  const shift = (card: BoardCard, delta: -1 | 1) => {
    const columns = (s.data?.columns ?? []).filter((c) => !c.concludes);
    const at = columns.findIndex((c) => c.key === card.columnKey);
    const next = columns[at + delta];
    if (next) void move(card, next.key);
    else announce(delta < 0 ? 'Já está na primeira coluna.' : 'Já está na última coluna.');
  };

  const reorder = (card: BoardCard, delta: -1 | 1) => {
    const view = views.find((v) => v.column.key === card.columnKey);
    const ids = view?.cards.map((c) => c.ticketId) ?? [];
    const at = ids.indexOf(card.ticketId);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= ids.length) {
      announce(delta < 0 ? 'Já está no topo da coluna.' : 'Já está no fim da coluna.');
      return;
    }
    focusAfter.current = card.ticketId;
    const before = delta < 0 ? ids[to]! : (ids[to + 1] ?? null);
    void useBoard.getState().moveCard(card.ticketId, card.columnKey, before).then(() => announce(`${card.reference} na posição ${to + 1} de ${ids.length}.`));
  };

  const onDropAt = (spot: DropSpot) => {
    const id = dragId;
    setDragId(null);
    setDrop(null);
    const card = s.data?.cards.find((c) => c.ticketId === id);
    if (card) void move(card, spot.columnKey, spot.beforeId);
  };

  const boardMenu: MenuItemSpec[] = [
    { id: 'rename', label: 'Renomear quadro…', onSelect: () => setDialog({ kind: 'rename-board' }) },
    { id: 'delete', label: 'Excluir quadro…', tone: 'danger', onSelect: () => setDialog({ kind: 'delete-board' }) },
  ];

  const lanes = s.data?.columns.filter((c) => c.kind === 'lane') ?? [];

  return (
    <section aria-label="Quadro" className="flex h-full min-h-0 flex-col">
      <header className="px-6 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-normal text-fg">Quadro</h1>
            <p className="mt-1 text-sm text-fg-muted">Os tickets não resolvidos em colunas. Arraste um cartão para mudar o status.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {s.boards.length > 0 ? (
              <Select
                aria-label="Quadro"
                className="w-56"
                value={s.activeId != null ? String(s.activeId) : undefined}
                onValueChange={(v) => void s.selectBoard(Number(v))}
                options={s.boards.map((b) => ({ value: String(b.id), label: b.name }))}
              />
            ) : null}
            {canConfigure && board ? <Kebab label="Ações do quadro" items={boardMenu} /> : null}
            {canConfigure ? (
              <Button variant="outline" leadingIcon={<Plus />} onClick={() => setDialog({ kind: 'new-board' })}>Novo quadro</Button>
            ) : null}
            {canMove && board ? (
              <Button variant="primary" leadingIcon={<Plus />} onClick={() => setDialog({ kind: 'new-lane' })}>Nova coluna</Button>
            ) : null}
            <IconButton label="Atualizar o quadro" icon={<RefreshCw />} variant="outline" disabled={s.phase === 'loading'} onClick={() => void s.reload()} />
          </div>
        </div>

        {s.data ? (
          <div role="search" aria-label="Filtrar o quadro" className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
              <Input aria-label="Buscar no quadro" placeholder="Buscar no quadro" className="pl-8" value={s.filters.query} onChange={(e) => s.setFilters({ query: e.target.value })} />
            </div>
            <Select
              aria-label="Responsável"
              className="w-44"
              value={s.filters.assignee}
              onValueChange={(v) => s.setFilters({ assignee: v })}
              options={[{ value: '', label: 'Todos os responsáveis' }, { value: 'none', label: 'Sem responsável' }, ...options.assignees.map(([id, name]) => ({ value: id, label: name }))]}
            />
            <Select
              aria-label="Prioridade"
              className="w-48"
              value={s.filters.priority}
              onValueChange={(v) => s.setFilters({ priority: v as Priority | '' })}
              options={[{ value: '', label: 'Todas as prioridades' }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))]}
            />
            <Select
              aria-label="Empresa"
              className="w-44"
              value={s.filters.company}
              onValueChange={(v) => s.setFilters({ company: v })}
              options={[{ value: '', label: 'Todas as empresas' }, ...options.companies.map((c) => ({ value: c, label: c }))]}
            />
            <Switch checked={s.filters.overdueOnly} onCheckedChange={(v) => s.setFilters({ overdueOnly: v })} label="Só atrasados" />
            {filtered ? (
              <Button variant="ghost" leadingIcon={<X />} onClick={s.clearFilters}>Limpar filtros ({filterCount})</Button>
            ) : null}
            <span className="ml-auto text-xs text-fg-muted" aria-live="polite">
              {filtered ? `${views.reduce((n, v) => n + v.cards.length, 0)} de ${s.data.cards.length} tickets` : `${s.data.cards.length} tickets`}
            </span>
          </div>
        ) : null}
        {IS_REAL && s.data ? (
          <p className="mt-2 text-xs text-fg-muted">A ordem dos cartões dentro da coluna vale somente neste navegador: o backend ainda não tem este recurso.</p>
        ) : null}
      </header>

      <div
        className="min-h-0 flex-1 px-6 pb-4 pt-4"
        onDragOver={(e) => {
          // Rolagem horizontal ao arrastar perto das bordas (inclui a margem da página).
          const box = scrollRef.current;
          if (dragId == null || !box) return;
          const r = box.getBoundingClientRect();
          if (e.clientX < r.left + 64) box.scrollLeft -= 24;
          else if (e.clientX > r.right - 64) box.scrollLeft += 24;
        }}
      >
        {s.boardsPhase === 'error' ? (
          <Banner tone="error" title="Não foi possível carregar os quadros" onRetry={() => void s.loadBoards()}>{s.boardsError}</Banner>
        ) : s.boardsPhase !== 'ready' ? (
          <BoardSkeleton />
        ) : s.boards.length === 0 ? (
          <EmptyState
            illustration="box"
            title="Nenhum quadro ainda"
            description={canConfigure ? 'Crie o primeiro quadro para organizar os tickets em colunas.' : 'Peça a um administrador para criar um quadro.'}
            action={canConfigure ? <Button variant="primary" leadingIcon={<Plus />} onClick={() => setDialog({ kind: 'new-board' })}>Novo quadro</Button> : undefined}
          />
        ) : s.phase === 'error' && !s.data ? (
          <Banner tone="error" title="Não foi possível carregar o quadro" onRetry={() => void s.reload()}>{s.error}</Banner>
        ) : !s.data ? (
          <BoardSkeleton />
        ) : s.data.cards.length === 0 && lanes.length === 0 ? (
          <EmptyState illustration="box" title="Nenhum ticket em aberto" description="Quando houver tickets não resolvidos, eles aparecem aqui, cada um na coluna do seu status." />
        ) : (
          <div ref={scrollRef} className="h-full overflow-x-auto" data-board-scroll>
            {s.phase === 'error' ? (
              <Banner tone="warning" className="mb-2" onRetry={() => void s.reload()}>Não foi possível atualizar o quadro agora. {s.error}</Banner>
            ) : null}
            <div className="flex h-full items-stretch gap-3 pb-1">
              {views.map((view) => {
                const laneIndex = lanes.findIndex((l) => l.key === view.column.key);
                return (
                  <BoardColumnView
                    key={view.column.key}
                    view={view}
                    filtered={filtered}
                    canMove={canMove}
                    canConfigure={canConfigure}
                    isFirstLane={laneIndex === 0}
                    isLastLane={laneIndex === lanes.length - 1}
                    dragging={dragId != null}
                    drop={drop}
                    onDropSpot={setDrop}
                    onDrop={onDropAt}
                    onEditWip={() => setDialog({ kind: 'wip', column: view.column })}
                    onRename={() => setDialog({ kind: 'rename-lane', column: view.column })}
                    onShiftLane={(d) => view.column.laneId != null && void s.moveLane(view.column.laneId, d)}
                    onDeleteLane={() => setDialog({ kind: 'delete-lane', column: view.column })}
                  >
                    {view.cards.map((card, i) => (
                      <CardWithSpot key={card.ticketId} showSpot={dragId != null && drop?.columnKey === view.column.key && drop.beforeId === card.ticketId}>
                        <BoardCardView
                          card={card}
                          column={view.column}
                          stageColumn={s.data ? stageColumnOf(s.data, card) : undefined}
                          targets={s.data!.columns.filter((c) => c.key !== card.columnKey && !c.concludes)}
                          canMove={canMove}
                          busy={s.busy.includes(card.ticketId)}
                          dragging={dragId === card.ticketId}
                          position={i + 1}
                          size={view.cards.length}
                          onOpen={() => openTicket(card.ticketId, { title: card.subject, requesterName: card.requesterName })}
                          onMove={(key) => void move(card, key)}
                          onShift={(d) => shift(card, d)}
                          onReorder={(d) => reorder(card, d)}
                          onEditDue={() => setDialog({ kind: 'due', card })}
                          onClearDue={() => void s.setDue(card.ticketId, null)}
                          onRelease={() => {
                            const stage = s.data && stageColumnOf(s.data, card);
                            if (stage) void move(card, stage.key);
                          }}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', String(card.ticketId));
                            setDragId(card.ticketId);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setDrop(null);
                          }}
                        />
                      </CardWithSpot>
                    ))}
                    {dragId != null && drop?.columnKey === view.column.key && drop.beforeId === null ? <li aria-hidden className="h-1 shrink-0 list-none rounded bg-action" /> : null}
                  </BoardColumnView>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      <NameDialog
        open={dialog?.kind === 'new-board'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Novo quadro"
        description="O quadro mostra os tickets não resolvidos, cada um na coluna do seu status."
        label="Nome do quadro"
        confirmLabel="Criar quadro"
        maxLength={80}
        onSubmit={s.createBoard}
      />
      <NameDialog
        open={dialog?.kind === 'rename-board'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Renomear quadro"
        label="Nome do quadro"
        initial={board?.name}
        confirmLabel="Salvar"
        maxLength={80}
        onSubmit={s.renameBoard}
      />
      <NameDialog
        open={dialog?.kind === 'new-lane'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Nova coluna"
        description="Coluna de organização: arrastar um cartão para ela só o fixa ali. O status do ticket não muda."
        label="Nome da coluna"
        hint="Exemplos: Depende do gestor, Sprint desta semana."
        confirmLabel="Criar coluna"
        maxLength={60}
        onSubmit={s.createLane}
      />
      <NameDialog
        open={dialog?.kind === 'rename-lane'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Renomear coluna"
        label="Nome da coluna"
        initial={dialog?.kind === 'rename-lane' ? dialog.column.name : undefined}
        confirmLabel="Salvar"
        maxLength={60}
        onSubmit={(name) => (dialog?.kind === 'rename-lane' && dialog.column.laneId != null ? s.renameLane(dialog.column.laneId, name) : Promise.resolve(false))}
      />
      <WipDialog
        open={dialog?.kind === 'wip'}
        onOpenChange={(o) => !o && setDialog(null)}
        columnName={dialog?.kind === 'wip' ? dialog.column.name : ''}
        current={dialog?.kind === 'wip' ? dialog.column.wipLimit : null}
        onSubmit={(limit) => (dialog?.kind === 'wip' ? s.setWipLimit(dialog.column.key, limit) : Promise.resolve(false))}
      />
      <DueDialog
        open={dialog?.kind === 'due'}
        onOpenChange={(o) => !o && setDialog(null)}
        reference={dialog?.kind === 'due' ? dialog.card.reference : ''}
        current={dialog?.kind === 'due' ? dialog.card.dueAt : undefined}
        onSubmit={(dueAt) => (dialog?.kind === 'due' ? s.setDue(dialog.card.ticketId, dueAt) : Promise.resolve(false))}
      />
      <ConfirmModal
        open={dialog?.kind === 'delete-lane'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === 'delete-lane' ? `Excluir a coluna "${dialog.column.name}"?` : 'Excluir coluna?'}
        description="Os tickets fixados nela voltam para as colunas dos seus status. Nenhum ticket é apagado, mas a organização desta coluna se perde."
        confirmLabel="Excluir coluna"
        onConfirm={async () => {
          if (dialog?.kind !== 'delete-lane' || dialog.column.laneId == null) return;
          if (!(await s.deleteLane(dialog.column.laneId))) throw new Error('falhou');
          setDialog(null);
        }}
      />
      <ConfirmModal
        open={dialog?.kind === 'delete-board'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={board ? `Excluir o quadro "${board.name}"?` : 'Excluir quadro?'}
        description="As colunas de organização e os prazos internos deste quadro serão apagados e não podem ser recuperados. Os tickets não são afetados."
        confirmLabel="Excluir quadro"
        onConfirm={async () => {
          if (!(await s.deleteBoard())) throw new Error('falhou');
          setDialog(null);
        }}
      />
    </section>
  );
}

function CardWithSpot({ showSpot, children }: { showSpot: boolean; children: React.ReactNode }) {
  return (
    <>
      {showSpot ? <li aria-hidden className="h-1 shrink-0 list-none rounded bg-action" /> : null}
      {children}
    </>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Carregando o quadro" className="flex h-full gap-3 overflow-hidden">
      {[0, 1, 2, 3].map((c) => (
        <div key={c} className="flex w-72 shrink-0 flex-col">
          <Skeleton className="h-10 rounded-b-none" />
          <div className="flex flex-1 flex-col gap-2 rounded-b border border-t-0 border-line bg-surface-1 p-2">
            {[0, 1, 2].slice(0, 3 - (c % 2)).map((i) => (
              <div key={i} className="rounded border border-line bg-surface p-2.5">
                <Skeleton width="30%" />
                <Skeleton className="mt-2" width="90%" />
                <Skeleton className="mt-2" width="60%" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
