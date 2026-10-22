import { ExternalLink, Pencil, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Avatar,
  Button,
  ColumnsMenu,
  ConfirmModal,
  SlaPill,
  StatusBadge,
  Switch,
  Table,
  type ColumnDef,
  type MenuItemSpec,
  type SortState,
} from '@/components/ui';
import { CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_STATUSES, PRIORITY_LABEL } from '@/lib/status';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/cn';
import { toast } from '@/store/useUi';
import type { Priority, StatusCategory, TicketStatus } from '@/types/domain';
import { Cod, Secao, Subsecao } from './Blocos';
import { TICKETS_EXEMPLO, type TicketExemplo } from './dados';

/* -------------------------------------------------------------------------- */
/* Colunas, ordenação e agrupamento                                            */
/* -------------------------------------------------------------------------- */

const ID_TABELA = 'kit-tickets';

function statusDe(ticket: TicketExemplo): TicketStatus | undefined {
  return DEFAULT_STATUSES.find((s) => s.id === ticket.statusId);
}

function categoriaDe(ticket: TicketExemplo): StatusCategory {
  return statusDe(ticket)?.category ?? 'open';
}

const PESO_PRIORIDADE: Record<Priority, number> = { low: 1, normal: 2, high: 3, urgent: 4 };

const CANAL_ROTULO: Record<TicketExemplo['canal'], string> = { email: 'E-mail', web_form: 'Formulário web' };

const getRowId = (ticket: TicketExemplo): string => String(ticket.id);
const getRowLabel = (ticket: TicketExemplo): string => `ticket ${ticket.id}`;

const agruparPorCategoria = (ticket: TicketExemplo) => ({
  key: categoriaDe(ticket),
  label: `Categoria do status: ${CATEGORY_LABEL[categoriaDe(ticket)]}`,
});

const COLUNAS: ColumnDef<TicketExemplo>[] = [
  {
    id: 'assunto',
    header: 'Assunto',
    width: 260,
    minWidth: 120,
    sortable: true,
    cell: (t) => (
      <span className="font-semibold" title={t.assunto}>
        {t.assunto}
      </span>
    ),
  },
  {
    id: 'solicitante',
    header: 'Solicitante',
    width: 190,
    sortable: true,
    cell: (t) => (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar name={t.solicitante} size={24} decorative />
        <span className="truncate" title={t.solicitante}>
          {t.solicitante}
        </span>
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    width: 128,
    sortable: true,
    cell: (t) => <StatusBadge status={statusDe(t)} />,
  },
  {
    id: 'sla',
    header: 'SLA',
    width: 150,
    sortable: true,
    cell: (t) => (t.sla ? <SlaPill dueAt={t.sla.dueAt} state={t.sla.state} target="first_reply" compact /> : <span className="text-fg-muted">—</span>),
  },
  {
    id: 'prioridade',
    header: 'Prioridade',
    width: 116,
    sortable: true,
    hideable: true,
    cell: (t) =>
      t.prioridade ? (
        // text-sla-breachText (e não text-danger): também passa de 4,5:1 sobre a linha selecionada (bg-action-soft).
        <span className={cn(t.prioridade === 'urgent' && 'font-semibold text-sla-breachText')}>{PRIORITY_LABEL[t.prioridade]}</span>
      ) : (
        <span className="text-fg-muted">—</span>
      ),
  },
  {
    id: 'atualizado',
    header: 'Atualizado',
    width: 160,
    sortable: true,
    hideable: true,
    cell: (t) => <span className="text-fg-muted">{relativeTime(t.atualizadoEm)}</span>,
  },
  {
    id: 'canal',
    header: 'Canal',
    width: 140,
    sortable: true,
    defaultHidden: true,
    cell: (t) => CANAL_ROTULO[t.canal],
  },
];

function valorDeOrdenacao(ticket: TicketExemplo, colunaId: string): string | number {
  switch (colunaId) {
    case 'assunto':
      return ticket.assunto;
    case 'solicitante':
      return ticket.solicitante;
    case 'status':
      return DEFAULT_STATUSES.findIndex((s) => s.id === ticket.statusId);
    case 'sla':
      return ticket.sla ? new Date(ticket.sla.dueAt).getTime() : Number.POSITIVE_INFINITY;
    case 'prioridade':
      return ticket.prioridade ? PESO_PRIORIDADE[ticket.prioridade] : 0;
    case 'atualizado':
      return new Date(ticket.atualizadoEm).getTime();
    case 'canal':
      return CANAL_ROTULO[ticket.canal];
    default:
      return 0;
  }
}

/** A Table só informa a ordenação: quem reordena as linhas é o consumidor (aqui, a própria seção). */
function ordenar(linhas: TicketExemplo[], ordem: SortState | null, agrupado: boolean): TicketExemplo[] {
  const copia = [...linhas];
  if (ordem) {
    const sinal = ordem.direction === 'asc' ? 1 : -1;
    copia.sort((a, b) => {
      const va = valorDeOrdenacao(a, ordem.columnId);
      const vb = valorDeOrdenacao(b, ordem.columnId);
      if (typeof va === 'string' && typeof vb === 'string') return sinal * va.localeCompare(vb, 'pt-BR');
      if (va === vb) return 0;
      return sinal * (Number(va) < Number(vb) ? -1 : 1);
    });
  }
  // Com agrupamento a Table cria os grupos na ordem em que as chaves aparecem: fixa a ordem das categorias
  // (a ordenação estável preserva a ordem escolhida dentro de cada grupo).
  if (agrupado) copia.sort((a, b) => CATEGORY_ORDER.indexOf(categoriaDe(a)) - CATEGORY_ORDER.indexOf(categoriaDe(b)));
  return copia;
}

/* -------------------------------------------------------------------------- */
/* Tabela principal                                                            */
/* -------------------------------------------------------------------------- */

function TabelaPrincipal() {
  const [linhas, setLinhas] = useState<TicketExemplo[]>(TICKETS_EXEMPLO);
  const [ordem, setOrdem] = useState<SortState | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [agrupar, setAgrupar] = useState(true);
  const [selecionavel, setSelecionavel] = useState(true);
  const [redimensionavel, setRedimensionavel] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [alvo, setAlvo] = useState<TicketExemplo | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const recarregar = () => {
    setCarregando(true);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setCarregando(false), 500);
  };

  const exibidas = useMemo(() => ordenar(linhas, ordem, agrupar), [linhas, ordem, agrupar]);

  const apagar = () => {
    if (!alvo) return;
    const id = getRowId(alvo);
    setLinhas((atuais) => atuais.filter((t) => t.id !== alvo.id));
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      proximos.delete(id);
      return proximos;
    });
    toast.success(`Ticket #${alvo.id} apagado (demonstração)`);
  };

  const acoesDaLinha = (ticket: TicketExemplo): MenuItemSpec[] => [
    { id: 'abrir', label: 'Abrir em nova aba', icon: <ExternalLink />, onSelect: () => toast.info(`Abrindo o ticket #${ticket.id}`) },
    { id: 'editar', label: 'Editar', icon: <Pencil />, onSelect: () => toast.info(`Editando o ticket #${ticket.id}`) },
    { id: 'atribuir', label: 'Atribuir a mim', icon: <UserPlus />, separatorBefore: true, onSelect: () => toast.success(`Ticket #${ticket.id} atribuído a você`) },
    {
      id: 'apagar',
      label: 'Apagar',
      icon: <Trash2 />,
      tone: 'danger',
      onSelect: () => {
        setAlvo(ticket);
        setConfirmando(true);
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Switch checked={agrupar} onCheckedChange={setAgrupar} label="Agrupar por categoria" />
          <Switch checked={selecionavel} onCheckedChange={setSelecionavel} label="Seleção" />
          <Switch checked={redimensionavel} onCheckedChange={setRedimensionavel} label="Colunas redimensionáveis" />
        </div>
        <div className="flex items-center gap-2">
          <Button leadingIcon={<RotateCcw />} loading={carregando} onClick={recarregar}>
            Recarregar (500 ms)
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setLinhas(TICKETS_EXEMPLO);
              setSelecionados(new Set());
            }}
          >
            Restaurar exemplos
          </Button>
          <ColumnsMenu id={ID_TABELA} columns={COLUNAS} />
        </div>
      </div>

      <p className="text-xs text-fg-muted" aria-live="polite">
        {selecionavel && selecionados.size > 0
          ? `${selecionados.size} de ${linhas.length} selecionado${selecionados.size > 1 ? 's' : ''}`
          : `${linhas.length} tickets`}
        {ordem ? ` · ordenado por ${ordem.columnId} (${ordem.direction === 'asc' ? 'crescente' : 'decrescente'})` : ''}
      </p>

      <div className="overflow-hidden rounded border border-line">
        <Table<TicketExemplo>
          id={ID_TABELA}
          aria-label="Tickets de exemplo"
          columns={COLUNAS}
          rows={exibidas}
          getRowId={getRowId}
          getRowLabel={getRowLabel}
          loading={carregando}
          sort={ordem}
          onSortChange={setOrdem}
          selectable={selecionavel}
          selectedIds={selecionados}
          onSelectionChange={setSelecionados}
          groupBy={agrupar ? agruparPorCategoria : undefined}
          defaultCollapsedGroups={['solved']}
          rowActions={acoesDaLinha}
          onRowClick={(ticket) => toast.info(`Abrindo o ticket #${ticket.id}`, { description: ticket.assunto })}
          resizable={redimensionavel}
          empty={{
            illustration: 'box',
            title: 'Nenhum ticket na tabela',
            description: 'Você apagou todos os exemplos.',
            action: (
              <Button variant="primary" onClick={() => setLinhas(TICKETS_EXEMPLO)}>
                Restaurar exemplos
              </Button>
            ),
          }}
        />
      </div>

      <ConfirmModal
        open={confirmando}
        onOpenChange={setConfirmando}
        title={alvo ? `Apagar o ticket #${alvo.id}?` : 'Apagar ticket?'}
        description={alvo ? `“${alvo.assunto}” será removido da tabela de demonstração.` : undefined}
        confirmLabel="Apagar ticket"
        onConfirm={apagar}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Estados: carregando, vazio e erro                                           */
/* -------------------------------------------------------------------------- */

/** Subconjunto compacto (assunto, status, atualizado) para as tabelas de estado, que dividem a linha em duas colunas. */
const COLUNAS_RESUMO: ColumnDef<TicketExemplo>[] = [
  { ...COLUNAS[0], width: 190 },
  { ...COLUNAS[2], width: 110 },
  { ...COLUNAS[5], width: 130 },
].map((coluna) => ({ ...coluna, sortable: false, hideable: false }));

function Quadro({ titulo, descricao, children }: { titulo: string; descricao: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div>
        <h4 className="text-sm font-semibold text-fg">{titulo}</h4>
        <p className="text-xs text-fg-muted">{descricao}</p>
      </div>
      <div className="overflow-hidden rounded border border-line">{children}</div>
    </div>
  );
}

type FaseErro = 'erro' | 'carregando' | 'pronto';

function TabelaComErro() {
  const [fase, setFase] = useState<FaseErro>('erro');

  useEffect(() => {
    if (fase !== 'carregando') return undefined;
    const id = window.setTimeout(() => setFase('pronto'), 500);
    return () => window.clearTimeout(id);
  }, [fase]);

  return (
    <Quadro
      titulo="Erro"
      descricao="Banner de erro com “Tentar novamente”. A nova tentativa mostra o carregamento e então os dados."
    >
      <Table<TicketExemplo>
        id="kit-tickets-erro"
        aria-label="Tabela com erro"
        columns={COLUNAS_RESUMO}
        rows={fase === 'pronto' ? TICKETS_EXEMPLO.slice(0, 3) : []}
        getRowId={getRowId}
        loading={fase === 'carregando'}
        error={fase === 'erro' ? { message: 'Não foi possível carregar os tickets.', onRetry: () => setFase('carregando') } : undefined}
      />
      {fase === 'pronto' ? (
        <div className="border-t border-line p-2">
          <Button variant="ghost" onClick={() => setFase('erro')}>
            Simular erro de novo
          </Button>
        </div>
      ) : null}
    </Quadro>
  );
}

function TabelasDeEstado() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Quadro titulo="Carregando" descricao="Linhas de skeleton com a mesma altura das linhas de dados.">
        <Table<TicketExemplo>
          id="kit-tickets-carregando"
          aria-label="Tabela carregando"
          columns={COLUNAS_RESUMO}
          rows={[]}
          getRowId={getRowId}
          loading
        />
      </Quadro>
      <Quadro titulo="Vazio" descricao="O cabeçalho continua; o corpo mostra a ilustração, o texto e uma ação.">
        <Table<TicketExemplo>
          id="kit-tickets-vazio"
          aria-label="Tabela vazia"
          columns={COLUNAS_RESUMO}
          rows={[]}
          getRowId={getRowId}
          empty={{
            illustration: 'search',
            title: 'Nenhum ticket encontrado',
            description: 'Ajuste os filtros ou crie um novo ticket.',
            action: <Button variant="primary">Limpar filtros</Button>,
          }}
        />
      </Quadro>
      <TabelaComErro />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Seção                                                                       */
/* -------------------------------------------------------------------------- */

export function SecaoTabela() {
  return (
    <Secao
      id="tabela"
      numero={6}
      titulo="Tabela"
      descricao={
        <>
          Cabeçalho 12/600 com <Cod>aria-sort</Cod>, seleção com “selecionar todas”, agrupamento recolhível, kebab por linha, colunas
          redimensionáveis por arrasto ou teclado e estados de carregamento, vazio e erro.
        </>
      }
    >
      <Subsecao
        titulo="Table com 12 tickets de exemplo"
        descricao="Clique nos cabeçalhos para ordenar (crescente, decrescente, nenhuma). Arraste a borda de um cabeçalho para redimensionar, ou foque a alça e use ← e → (Shift = passo maior). Larguras e colunas visíveis ficam salvas no navegador. A linha é alcançável por Tab e abre com Enter."
      >
        <TabelaPrincipal />
      </Subsecao>

      <Subsecao titulo="Estados">
        <TabelasDeEstado />
      </Subsecao>
    </Secao>
  );
}
