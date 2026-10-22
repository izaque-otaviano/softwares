import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureApi, db, resetDb } from '@/api';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { textToHtml, htmlToText } from '@/components/admin/macros/macroText';
import { MacroPicker } from '@/components/ticket/MacroPicker';
import { useFormStore } from '@/components/ticket/formStore';
import { resetTicketLookups } from '@/components/ticket/useTicketLookups';
import { RightRail } from '@/components/shell/RightRail';
import { TooltipProvider } from '@/components/ui';
import TicketPage from '@/pages/Ticket';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import { useRightPanel } from '@/components/ticket/panels/panelState';
import MacroEdit from './MacroEdit';
import Macros from './Macros';
import Statuses from './Statuses';
import TriggerEdit from './TriggerEdit';
import Triggers from './Triggers';

function Loc() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

function renderAt(path: string, extra?: React.ReactNode) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Loc />
        <div className="flex">
          <div className="flex-1">
            <Routes>
              <Route path="/admin/statuses" element={<Statuses />} />
              <Route path="/admin/triggers" element={<Triggers />} />
              <Route path="/admin/triggers/new" element={<TriggerEdit />} />
              <Route path="/admin/triggers/:id" element={<TriggerEdit />} />
              <Route path="/admin/macros" element={<Macros />} />
              <Route path="/admin/macros/new" element={<MacroEdit />} />
              <Route path="/admin/macros/:id" element={<MacroEdit />} />
              <Route path="/agent/tickets/:id" element={<TicketPage />} />
            </Routes>
          </div>
        </div>
      </MemoryRouter>
      {extra}
    </TooltipProvider>,
  );
}

const F = () => useFormStore.getState();

beforeEach(() => {
  resetDb();
  resetDirectoryCache();
  resetTicketLookups();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useFormStore.setState({ forms: {} });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useRightPanel.setState({ open: null });
  useUi.setState({ toasts: [], tableColumns: {} });
  useTickets.setState({ loaded: false, loading: false, error: null, tickets: [], statuses: [], counts: {} });
});

async function submitNewTicket(mode: 'public' | 'internal', n: number) {
  const key = `new-ticket:${n}`;
  useTabs.getState().openTab({ kind: 'new-ticket', refId: String(n), title: 'Novo ticket' });
  F().init(key, null);
  F().patch(key, { subject: `Teste ${n}`, requesterId: 'u1' });
  F().setReplyMode(key, mode);
  F().setBody(key, '<p>Descrição</p>');
  const r = await F().submit(key);
  expect(r.ok).toBe(true);
  return db.tickets.find((x) => x.id === (r.ok ? r.ticketId : -1))!;
}
const triggerEvents = (t: { events: { kind: string; text: string }[] }) => t.events.filter((e) => e.kind === 'notification' && e.text.includes('Gatilho'));

describe('Status do ticket (admin)', () => {
  it('agrupa pelas 4 categorias com nome e descrição, e tem as colunas pedidas', async () => {
    renderAt('/admin/statuses');
    const table = await screen.findByRole('group', { name: 'Status do ticket' });
    await within(table).findAllByText('Em andamento');
    for (const c of ['Novo', 'Aberto', 'Pendente', 'Resolvido']) {
      expect(within(table).getByRole('button', { name: new RegExp(`^${c}.*\\(\\d+\\)`) })).toBeInTheDocument();
    }
    expect(within(table).getByText(/Tickets em atendimento/)).toBeInTheDocument();
    for (const h of ['Nome (agente)', 'Descrição (agente)', 'Nome (usuário final)']) {
      expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: 'Status do ticket por formulário' })).toBeInTheDocument();
  });

  it('criar status aparece na hora no menu de envio do agente, sem recarregar; desativar o remove', async () => {
    await useTickets.getState().load();
    const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me' && x.statusId === 'open')!;
    renderAt('/admin/statuses', <TicketAside id={t.id} />);
    await screen.findByRole('button', { name: /Enviar como Aberto/ });

    await userEvent.click(screen.getByRole('button', { name: 'Criar status do ticket' }));
    const dialog = await screen.findByRole('dialog', { name: 'Criar status do ticket' });
    await userEvent.type(within(dialog).getByLabelText(/Nome do status para o agente/), 'Aguardando peça');
    await userEvent.type(within(dialog).getByLabelText(/Nome do status para o usuário final/), 'Em análise');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Criar status do ticket' })).toBeNull());

    // mesma árvore, sem recarregar: tabela do admin e menu do agente
    const table = screen.getByRole('group', { name: 'Status do ticket' });
    expect(await within(table).findByText('Aguardando peça')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Escolher status de envio' }));
    expect(await screen.findByRole('menuitem', { name: 'Aguardando peça' })).toBeInTheDocument();
    expect(useTickets.getState().statuses.some((s) => s.agentName === 'Aguardando peça')).toBe(true);
    await userEvent.keyboard('{Escape}');

    // editar o nome reflete igual
    const created = useTickets.getState().statuses.find((s) => s.agentName === 'Aguardando peça')!;
    await useTickets.getState().saveStatus({ ...created, agentName: 'Aguardando peça (v2)' });
    await userEvent.click(await screen.findByRole('button', { name: 'Escolher status de envio' }));
    expect(await screen.findByRole('menuitem', { name: 'Aguardando peça (v2)' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    // desativar pela UI do admin tira do menu de envio
    await userEvent.click(within(table).getByRole('button', { name: 'Mais ações: Aguardando peça (v2)' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Desativar' }));
    await waitFor(() => expect(within(table).queryByText('Aguardando peça (v2)')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Escolher status de envio' }));
    await screen.findByRole('menuitem', { name: 'Resolvido' });
    expect(screen.queryByRole('menuitem', { name: 'Aguardando peça (v2)' })).toBeNull();
  });

  it('mostra erro com Tentar novamente', async () => {
    configureApi({ failRate: 1 });
    renderAt('/admin/statuses');
    expect(await screen.findAllByRole('button', { name: 'Tentar novamente' })).not.toHaveLength(0);
    configureApi({ failRate: 0 });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Tentar novamente' }))[0]!);
    expect(await screen.findAllByText('Em andamento')).not.toHaveLength(0);
  });
});

/** Tela do ticket do agente + RightRail, vivendo na mesma árvore do admin. */
function TicketAside({ id }: { id: number }) {
  return (
    <MemoryRouter initialEntries={[`/agent/tickets/${id}`]}>
      <Routes>
        <Route path="/agent/tickets/:id" element={<TicketPage />} />
      </Routes>
      <RightRail />
    </MemoryRouter>
  );
}

describe('Gatilhos (admin)', () => {
  it('lista agrupada por categoria, com contador, link e coluna de 7 dias', async () => {
    renderAt('/admin/triggers');
    const table = await screen.findByRole('group', { name: 'Gatilhos de ticket' });
    expect(await within(table).findByRole('link', { name: 'Notificar solicitante: ticket recebido' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: /^Notificações \(3\)$/ })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Iniciado por gatilho (7d)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Objeto' })).toBeInTheDocument();
    // inativo some do filtro padrão "Ativo"
    expect(within(table).queryByText('Reabrir quando o cliente responde')).toBeNull();
    await userEvent.click(within(table).getByRole('button', { name: /^Notificações/ }));
    expect(within(table).queryByRole('link', { name: 'Notificar agente: atribuição' })).toBeNull();
  });

  it('Editar ordem reordena por botão e persiste', async () => {
    renderAt('/admin/triggers');
    await screen.findByRole('link', { name: 'Notificar agente: atribuição' });
    await userEvent.click(screen.getByRole('button', { name: 'Editar ordem' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mover Notificar solicitante: ticket recebido para baixo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ordem' }));
    await waitFor(() => expect(db.triggers[0]!.id).toBe('t2'));
    expect(db.triggers[1]!.id).toBe('t1');
    expect(await screen.findByRole('button', { name: 'Editar ordem' })).toBeInTheDocument();
  });

  it('Alt + seta move a linha no teclado', async () => {
    renderAt('/admin/triggers');
    await screen.findByRole('link', { name: 'Notificar agente: atribuição' });
    await userEvent.click(screen.getByRole('button', { name: 'Editar ordem' }));
    const list = await screen.findByRole('list', { name: 'Ordem de avaliação dos gatilhos' });
    const first = within(list).getAllByRole('listitem')[0]!;
    first.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('Notificar solicitante: ticket recebido');
  });

  it('editor: cabeçalho, blocos de condições e ações; desativar pelo menu Ações faz o motor ignorar o gatilho (e reativar volta a gerar o evento)', async () => {
    renderAt('/admin/triggers/t1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Notificar solicitante: ticket recebido' })).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText(/Última atualização/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Trilha de navegação' })).toHaveTextContent('Gatilhos');
    expect(screen.getByRole('region', { name: 'Atende TODAS as condições a seguir' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Atende QUALQUER condição a seguir' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Categoria da ação 1' })).toHaveTextContent('Notificar por › E-mail do usuário');
    expect(screen.getByLabelText('Assunto do e-mail')).toHaveValue('Recebemos sua solicitação (#{{ticket.id}})');
    expect(screen.getByLabelText(/Corpo do e-mail/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Ações/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Desativar' }));
    await waitFor(() => expect(db.triggers.find((t) => t.id === 't1')!.active).toBe(false));
    expect(await screen.findByText('Inativo')).toBeInTheDocument();

    const off = await submitNewTicket('public', 1);
    expect(triggerEvents(off)).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /Ações/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ativar' }));
    await waitFor(() => expect(db.triggers.find((t) => t.id === 't1')!.active).toBe(true));
    const on = await submitNewTicket('public', 2);
    expect(triggerEvents(on)).toHaveLength(1);
    const internal = await submitNewTicket('internal', 3);
    expect(triggerEvents(internal)).toHaveLength(0);
  });

  it('editor: editar o assunto e salvar muda o evento gerado pelo motor', async () => {
    renderAt('/admin/triggers/t1');
    const subject = await screen.findByLabelText('Assunto do e-mail');
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Olá, ticket {{{{ticket.title}}');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/admin/triggers'));
    const t = await submitNewTicket('public', 1);
    const ev = triggerEvents(t)[0] as unknown as { meta: Record<string, string> };
    expect(ev.meta.Assunto).toBe('Olá, ticket Teste 1');
    expect(db.triggers.find((x) => x.id === 't1')!.updatedAt).toBeTruthy();
  });

  it('editor: criar gatilho novo (modelo) persiste e entra na lista; valida o nome', async () => {
    renderAt('/admin/triggers/new?modelo=notificar');
    const name = await screen.findByLabelText(/Nome do gatilho/);
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe o nome do gatilho.')).toBeInTheDocument();
    await userEvent.type(name, 'Meu gatilho novo');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(db.triggers.some((t) => t.name === 'Meu gatilho novo')).toBe(true));
    expect(await screen.findByRole('link', { name: 'Meu gatilho novo' })).toBeInTheDocument();
  });

  it('adicionar e remover condição', async () => {
    renderAt('/admin/triggers/t4');
    const any = await screen.findByRole('region', { name: 'Atende QUALQUER condição a seguir' });
    await userEvent.click(within(any).getByRole('button', { name: 'Adicionar condição' }));
    expect(within(any).getByRole('combobox', { name: 'Categoria da condição 1 (qualquer)' })).toBeInTheDocument();
    await userEvent.click(within(any).getByRole('button', { name: 'Remover condição 1 (qualquer)' }));
    expect(within(any).queryByRole('combobox', { name: /Categoria da condição 1/ })).toBeNull();
  });
});

describe('Macros (admin)', () => {
  it('tabela com as colunas pedidas e criação aparece no MacroPicker do agente', async () => {
    renderAt('/admin/macros');
    const table = await screen.findByRole('group', { name: 'Macros' });
    expect(await within(table).findByRole('link', { name: 'Cliente não responde' })).toBeInTheDocument();
    for (const h of ['Nome', 'Data da criação', 'Data da última atualização', 'Disponível para', 'Uso 7 dias']) {
      expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('button', { name: 'Criar macro' }));
    await userEvent.type(await screen.findByLabelText(/Nome da macro/), 'Pedir logs');
    await userEvent.type(screen.getByLabelText('Resposta pública'), 'Pode enviar os logs?\n\nObrigado.');
    await userEvent.type(screen.getByLabelText('Nota interna'), 'Pedido de logs feito');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('link', { name: 'Pedir logs' })).toBeInTheDocument();
    const saved = db.macros.find((m) => m.name === 'Pedir logs')!;
    expect(saved.actions.publicReply).toBe('<p>Pode enviar os logs?</p><p>Obrigado.</p>');
    expect(saved.createdAt).toBeTruthy();

    // o agente vê a macro criada
    document.body.innerHTML = '';
    render(
      <TooltipProvider>
        <MemoryRouter>
          <MacroPicker ticketKey="x" />
        </MemoryRouter>
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar macro' }));
    expect(await screen.findByText('Pedir logs')).toBeInTheDocument();
  });

  it('editar renomeia, desativar tira do picker; filtro padrão é Ativo', async () => {
    renderAt('/admin/macros/m1');
    const name = await screen.findByLabelText(/Nome da macro/);
    expect(name).toHaveValue('Cliente não responde');
    await userEvent.clear(name);
    await userEvent.type(name, 'Cliente sumiu');
    await userEvent.click(screen.getByRole('switch', { name: 'Macro ativa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(db.macros.find((m) => m.id === 'm1')!.name).toBe('Cliente sumiu'));
    expect(db.macros.find((m) => m.id === 'm1')!.active).toBe(false);
    expect(db.macros.find((m) => m.id === 'm1')!.createdAt).toBeTruthy();
    await screen.findByRole('group', { name: 'Macros' });
    expect(screen.queryByRole('link', { name: 'Cliente sumiu' })).toBeNull();
  });

  it('busca filtra a lista e erro oferece Tentar novamente', async () => {
    renderAt('/admin/macros');
    await screen.findByRole('link', { name: 'Cliente não responde' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Pesquisar macros' }), 'downgrade');
    expect(screen.queryByRole('link', { name: 'Cliente não responde' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Fazer downgrade e informar' })).toBeInTheDocument();
  });
});

describe('macroText', () => {
  it('converte texto em HTML e de volta', () => {
    expect(textToHtml('a <b>\nc\n\nd')).toBe('<p>a &lt;b&gt;<br/>c</p><p>d</p>');
    expect(htmlToText(textToHtml('a <b>\nc\n\nd'))).toBe('a <b>\nc\n\nd');
  });
});
