import { ApprovalPanel, AppsPanel, KnowledgePanel, SidePanel, TasksPanel } from './panels/StaticPanels';
import { CustomerPanel } from './panels/CustomerPanel';
import { MergePanel } from './panels/MergePanel';
import { useRightPanel } from './panels/panelState';

/**
 * Painel direito (`w-right`), um por vez; o trilho de ícones fica em `components/shell/RightRail.tsx`.
 * Fechado, devolve `null`.
 */
export function TicketRightRail({ ticketKey }: { ticketKey: string }) {
  const open = useRightPanel((s) => s.open);
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
