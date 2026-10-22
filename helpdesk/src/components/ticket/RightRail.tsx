import { Drawer } from '@/components/ui';
import { useIsNarrow } from '@/lib/useMediaQuery';
import { ApprovalPanel, AppsPanel, KnowledgePanel, SidePanel, TasksPanel } from './panels/StaticPanels';
import { CustomerPanel } from './panels/CustomerPanel';
import { MergePanel } from './panels/MergePanel';
import { PanelInDrawerContext } from './panels/PanelShell';
import { useRightPanel, type PanelId } from './panels/panelState';

const PANEL_TITLE: Record<PanelId, string> = {
  customer: 'Cliente',
  knowledge: 'Conhecimento',
  side: 'Conversas paralelas',
  merge: 'Sugestões de fusão',
  approval: 'Solicitação de aprovação',
  tasks: 'Tarefas',
  apps: 'Aplicativos',
};

/**
 * Painel direito (`w-right`), um por vez; o trilho de ícones fica em `components/shell/RightRail.tsx`.
 * Fechado, devolve `null`.
 */
export function TicketRightRail({ ticketKey }: { ticketKey: string }) {
  const open = useRightPanel((s) => s.open);
  const close = useRightPanel((s) => s.close);
  const narrow = useIsNarrow();
  const panel = <PanelBody open={open} ticketKey={ticketKey} />;
  if (!narrow) return panel;
  // Abaixo de 1024 px o painel vira Drawer: Esc, scrim e X fecham; o foco volta ao ícone do trilho.
  return (
    <Drawer open={open !== null} onOpenChange={(o) => !o && close()} title={open ? PANEL_TITLE[open] : 'Painel'} bodyClassName="p-0">
      <PanelInDrawerContext.Provider value>{panel}</PanelInDrawerContext.Provider>
    </Drawer>
  );
}

function PanelBody({ open, ticketKey }: { open: PanelId | null; ticketKey: string }) {
  switch (open) {
    case 'customer':
      return <CustomerPanel ticketKey={ticketKey} />;
    case 'knowledge':
      return <KnowledgePanel />;
    case 'side':
      return <SidePanel />;
    case 'merge':
      return <MergePanel ticketKey={ticketKey} />;
    case 'approval':
      return <ApprovalPanel />;
    case 'tasks':
      return <TasksPanel />;
    case 'apps':
      return <AppsPanel />;
    default:
      return null;
  }
}
