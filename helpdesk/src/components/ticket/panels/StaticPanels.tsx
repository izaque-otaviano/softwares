import { ChevronDown, Plus, Search } from 'lucide-react';
import { Button, EmptyState, IconButton, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui';
import { PanelShell } from './PanelShell';

export function KnowledgePanel() {
  return (
    <PanelShell
      title="Conhecimento"
      actions={<IconButton label="Adicionar conteúdo" size="sm" icon={<Plus aria-hidden className="h-4 w-4" />} />}
    >
      <p className="px-4 pt-3 text-xs font-semibold text-fg-muted">Conteúdo sugerido</p>
      <EmptyState
        compact
        title="Sem conteúdo sugerido"
        description="Não conseguimos achar conteúdo sugerido para esta conversa."
        action={
          <Button variant="outline" leadingIcon={<Search aria-hidden className="h-4 w-4" />}>
            Pesquisar por conteúdo
          </Button>
        }
      />
    </PanelShell>
  );
}

export function SidePanel() {
  return (
    <PanelShell title="Conversas paralelas">
      <EmptyState compact title="Nada aqui ainda" description="Nada aqui ainda. Ao criar conversas paralelas, você as verá exibidas aqui." />
    </PanelShell>
  );
}

export function ApprovalPanel() {
  return (
    <PanelShell title="Solicitação de aprovação" actions={<IconButton label="Criar solicitação" size="sm" icon={<Plus aria-hidden className="h-4 w-4" />} />}>
      <EmptyState
        compact
        title="Nenhuma solicitação"
        description="Peça a aprovação de outra pessoa antes de seguir com este ticket."
        action={<Button variant="outline">Criar solicitação de aprovação</Button>}
      />
    </PanelShell>
  );
}

export function TasksPanel() {
  return (
    <PanelShell title="Tarefas" actions={<IconButton label="Criar lista de tarefas" size="sm" icon={<Plus aria-hidden className="h-4 w-4" />} />}>
      <EmptyState
        compact
        title="Sem lista de tarefas ainda"
        action={
          <Menu>
            <MenuTrigger asChild>
              <Button variant="outline" trailingIcon={<ChevronDown aria-hidden className="h-4 w-4" />}>
                Adicionar lista de tarefas
              </Button>
            </MenuTrigger>
            <MenuContent align="center">
              <MenuItem>Lista em branco</MenuItem>
              <MenuItem>Checklist de resolução</MenuItem>
            </MenuContent>
          </Menu>
        }
      />
    </PanelShell>
  );
}

const APPS = [
  { name: 'Resumo de conversa', description: 'Gere um resumo do ticket para repassar a outro time.' },
  { name: 'Pedidos da loja', description: 'Consulte os pedidos do cliente sem sair do ticket.' },
  { name: 'Tradutor', description: 'Traduza mensagens recebidas e respostas.' },
];

export function AppsPanel() {
  return (
    <PanelShell title="Aplicativos">
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs font-semibold text-fg-muted">Sugeridos</p>
        <ul className="flex flex-col gap-2">
          {APPS.map((a) => (
            <li key={a.name} className="rounded border border-line p-3">
              <p className="text-sm font-semibold text-fg">{a.name}</p>
              <p className="mt-1 text-xs text-fg-muted">{a.description}</p>
            </li>
          ))}
        </ul>
        <Button variant="outline" leadingIcon={<Search aria-hidden className="h-4 w-4" />}>
          Pesquisar
        </Button>
      </div>
    </PanelShell>
  );
}
