import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { TooltipProvider } from '@/components/ui';
import TicketPage from '@/pages/Ticket';
import { resetRefData, useRefData } from '@/store/useRefData';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import { useFormStore } from './formStore';
import { resetTicketLookups } from './useTicketLookups';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Routes>
          <Route path="/agent/tickets/new" element={<TicketPage />} />
          <Route path="/agent/tickets/:id" element={<TicketPage />} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

const solved = () => db.statuses.find((s) => s.category === 'solved')!.id;

beforeEach(async () => {
  resetDb();
  resetRefData();
  resetDirectoryCache();
  resetTicketLookups();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useFormStore.setState({ forms: {}, requiredPrompt: null, focusRequest: null, pendingClose: null });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useUi.setState({ toasts: [] });
  useTickets.setState({ loaded: false, loading: false, error: null, tickets: [], counts: {} });
  await useTickets.getState().load();
});

const panel = async () => screen.findByRole('complementary', { name: 'Propriedades do ticket' });
const incident = () => useTickets.getState().tickets.find((t) => t.formId === '2' && t.statusId !== solved())!;

describe('painel de propriedades: campos do formulário do ticket', () => {
  it('mostra o formulário do ticket e os campos na ordem dele, com obrigatório marcado e o valor salvo', async () => {
    const t = incident();
    renderAt(`/agent/tickets/${t.id}`);
    const p = within(await panel());
    const region = await within(await panel()).findByRole('region', { name: 'Campos do formulário' });
    expect(p.getByRole('combobox', { name: 'Formulário' })).toHaveTextContent('Incidentes');
    const labels = within(region).getAllByText(/^(Número do contrato|Severidade|Prazo acordado)/).map((l) => l.textContent);
    expect(labels).toEqual(['Número do contrato*', 'Severidade*', 'Prazo acordado']);
    expect(within(region).getByLabelText(/Número do contrato/)).toHaveValue(String(t.fieldValues!.numero_do_contrato));
    expect(within(region).getByRole('combobox', { name: /Severidade/ })).toHaveAttribute('aria-required', 'true');
  });

  it('cada tipo tem o seu controle: texto, parágrafo, número, data, checkbox e lista', async () => {
    const t = useTickets.getState().tickets.find((x) => x.formId === '1')!;
    renderAt(`/agent/tickets/${t.id}`);
    // o formulário Financeiro (número + checkbox) e o padrão (texto + parágrafo) cobrem 4 tipos; data e lista vêm do Incidentes
    const user = userEvent.setup();
    const p = within(await panel());
    await p.findByRole('region', { name: 'Campos do formulário' });
    expect(p.getByLabelText('Número do contrato').tagName).toBe('INPUT');
    expect(p.getByLabelText('Observações internas').tagName).toBe('TEXTAREA');
    await user.click(p.getByRole('combobox', { name: 'Formulário' }));
    await user.click(await screen.findByRole('option', { name: 'Financeiro' }));
    const valor = await p.findByLabelText('Valor em disputa');
    await user.type(valor, '12abc');
    expect(await p.findByText(/Informe um número/)).toBeInTheDocument();
    await user.clear(valor);
    await user.type(valor, '12,5');
    expect(p.queryByText(/Informe um número/)).not.toBeInTheDocument();
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.values.fieldValues.valor_em_disputa).toBe(12.5);
    const check = p.getByRole('checkbox', { name: 'Cliente aprovou' });
    await user.click(check);
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.values.fieldValues.cliente_aprovou).toBe(true);
    await user.click(check);
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.values.fieldValues.cliente_aprovou).toBe(false); // false é um valor
    await user.click(p.getByRole('button', { name: /Limpar Cliente aprovou/ }));
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.values.fieldValues).not.toHaveProperty('cliente_aprovou');
    // data
    await user.click(p.getByRole('combobox', { name: 'Formulário' }));
    await user.click(await screen.findByRole('option', { name: 'Incidentes' }));
    const prazo = await p.findByLabelText('Prazo acordado');
    expect(prazo).toHaveAttribute('type', 'date');
    await user.click(p.getByRole('combobox', { name: 'Severidade' }));
    await user.click(await screen.findByRole('option', { name: 'Crítica' }));
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.values.fieldValues.severidade).toBe('critica');
  });

  it('salvar grava os valores junto das outras propriedades (um só envio) e some a pendência', async () => {
    const t = incident();
    const user = userEvent.setup();
    renderAt(`/agent/tickets/${t.id}`);
    const p = within(await panel());
    const contrato = await p.findByLabelText(/Número do contrato/);
    await user.clear(contrato);
    await user.type(contrato, 'C-777');
    useFormStore.getState().patch(`ticket:${t.id}`, { priority: 'urgent' });
    await user.click(screen.getByRole('button', { name: /^Enviar como/ }));
    await waitFor(() => expect(db.tickets.find((x) => x.id === t.id)!.fieldValues!.numero_do_contrato).toBe('C-777'));
    expect(db.tickets.find((x) => x.id === t.id)!.priority).toBe('urgent');
    await waitFor(() => expect(useFormStore.getState().isDirty(`ticket:${t.id}`)).toBe(false));
  });

  it('campo desativado: some se não tem valor; com valor aparece só para leitura', async () => {
    const t = incident();
    db.fields = db.fields.map((f) => (f.slug === 'prazo_acordado' || f.slug === 'numero_do_contrato' ? { ...f, active: false } : f));
    renderAt(`/agent/tickets/${t.id}`);
    const p = within(await panel());
    await p.findByRole('region', { name: 'Campos do formulário' });
    expect(p.queryByLabelText('Prazo acordado')).not.toBeInTheDocument();
    expect(p.getByText('Número do contrato (desativado)')).toBeInTheDocument();
    expect(p.getByText(t.fieldValues!.numero_do_contrato as string)).toHaveAttribute('data-readonly-field');
    expect(p.queryByRole('textbox', { name: /Número do contrato/ })).not.toBeInTheDocument();
  });

  it('troca de formulário só com mais de um ativo; a troca vira propriedade pendente (form_id)', async () => {
    const t = incident();
    const user = userEvent.setup();
    renderAt(`/agent/tickets/${t.id}`);
    const p = within(await panel());
    await user.click(await p.findByRole('combobox', { name: 'Formulário' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Formulário padrão (padrão)', 'Incidentes', 'Financeiro']);
    await user.click(screen.getByRole('option', { name: 'Financeiro' }));
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.values.formId).toBe('3');
    expect(useFormStore.getState().isDirty(`ticket:${t.id}`)).toBe(true);
  });

  it('com um único formulário ativo e sem campos, o grupo nem aparece', async () => {
    db.forms = db.forms.map((f) => (f.isDefault ? { ...f, fields: [] } : { ...f, active: false }));
    const t = useTickets.getState().tickets.find((x) => x.formId === '1')!;
    renderAt(`/agent/tickets/${t.id}`);
    await panel();
    await act(async () => {
      await useRefData.getState().ensureCustom();
    });
    expect(screen.queryByRole('region', { name: 'Campos do formulário' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Formulário' })).not.toBeInTheDocument();
  });
});

describe('resolver com obrigatório pendente', () => {
  it('antecipa no cliente: diálogo lista os campos, "Ir ao campo" foca o controle e o texto da resposta fica', async () => {
    const t = incident();
    const user = userEvent.setup();
    renderAt(`/agent/tickets/${t.id}`);
    const p = within(await panel());
    await p.findByLabelText(/Número do contrato/);
    const key = `ticket:${t.id}`;
    useFormStore.getState().setFieldValue(key, 'numero_do_contrato', null);
    useFormStore.getState().setBody(key, '<p>minha resposta</p>');
    await user.click(screen.getByRole('button', { name: 'Escolher status de envio' }));
    const items = await screen.findAllByRole('menuitem');
    await user.click(items.find((i) => /Resolvido/.test(i.textContent ?? ''))!);
    const dialog = await screen.findByRole('dialog', { name: 'Faltam campos obrigatórios' });
    expect(within(dialog).getByRole('list', { name: 'Campos pendentes' })).toHaveTextContent('Número do contrato');
    expect(within(dialog).getByRole('button', { name: 'Enviar assim mesmo' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ir ao campo Número do contrato' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Faltam campos obrigatórios' })).not.toBeInTheDocument());
    await waitFor(() => expect(p.getByLabelText(/Número do contrato/)).toHaveFocus());
    expect(useFormStore.getState().forms[key]!.bodyHtml).toBe('<p>minha resposta</p>');
    expect(db.tickets.find((x) => x.id === t.id)!.statusId).not.toBe(solved());
  });

  it('o servidor recusa (enviar assim mesmo): o diálogo muda para "não foi resolvido" e nada é fechado', async () => {
    const t = incident();
    const user = userEvent.setup();
    renderAt(`/agent/tickets/${t.id}`);
    const p = within(await panel());
    await p.findByLabelText(/Número do contrato/);
    const key = `ticket:${t.id}`;
    useFormStore.getState().setFieldValue(key, 'severidade', null);
    useFormStore.getState().setBody(key, '<p>texto</p>');
    await act(async () => {
      await useFormStore.getState().submit(key, solved());
    });
    const dialog = await screen.findByRole('dialog', { name: 'Faltam campos obrigatórios' });
    await user.click(within(dialog).getByRole('button', { name: 'Enviar assim mesmo' }));
    await waitFor(() => expect(screen.getByText(/O ticket não foi resolvido/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Enviar assim mesmo' })).not.toBeInTheDocument();
    expect(db.tickets.find((x) => x.id === t.id)!.statusId).not.toBe(solved());
    expect(useFormStore.getState().forms[key]!.bodyHtml).toBe('<p>texto</p>');
  });
});

describe('ticket novo com formulário', () => {
  it('começa no padrão, escolhe outro formulário, aplica equipe e tipo e valida obrigatórios antes de enviar', async () => {
    const user = userEvent.setup();
    useTabs.getState().openTab({ kind: 'new-ticket', refId: '1', title: 'Novo ticket' });
    renderAt('/agent/tickets/new?requester=u1');
    const p = within(await panel());
    expect(await p.findByRole('combobox', { name: 'Formulário' })).toHaveTextContent('Formulário padrão');
    await user.click(p.getByRole('combobox', { name: 'Formulário' }));
    await user.click(await screen.findByRole('option', { name: 'Incidentes' }));
    expect(p.getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Incidente');
    expect(useFormStore.getState().forms['new-ticket:1']!.values.assigneeGroupId).toBe('g2');
    await user.type(screen.getByLabelText('Assunto'), 'Novo com formulário');
    act(() => useFormStore.getState().setBody('new-ticket:1', '<p>Descrição</p>'));
    await user.click(screen.getByRole('button', { name: /^Enviar como/ }));
    expect(await screen.findByText('Preencha os campos obrigatórios: Número do contrato, Severidade.')).toBeInTheDocument();
    expect(p.getAllByText('Campo obrigatório.')).toHaveLength(2);
    const before = db.tickets.length;
    expect(db.tickets).toHaveLength(before);
    await user.type(p.getByLabelText(/Número do contrato/), 'C-NEW');
    await user.click(p.getByRole('combobox', { name: /Severidade/ }));
    await user.click(await screen.findByRole('option', { name: 'Alta' }));
    await user.click(screen.getByRole('button', { name: /^Enviar como/ }));
    await waitFor(() => expect(db.tickets).toHaveLength(before + 1));
    expect(db.tickets.at(-1)).toMatchObject({ subject: 'Novo com formulário', formId: '2', type: 'incident', fieldValues: { numero_do_contrato: 'C-NEW', severidade: 'alta' } });
  });
});
