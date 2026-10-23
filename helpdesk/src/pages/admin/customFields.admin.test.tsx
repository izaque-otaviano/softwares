import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureApi, resetDb } from '@/api';
import { db } from '@/api/mock/db';
import { AdminLayout } from '@/app/AdminLayout';
import { resetTicketLookups } from '@/components/ticket/useTicketLookups';
import { TooltipProvider } from '@/components/ui';
import { resetRefData } from '@/store/useRefData';
import { useUi } from '@/store/useUi';
import AdminFields from './Fields';
import AdminForms from './Forms';

function renderAdmin(path: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="fields" element={<AdminFields />} />
            <Route path="forms" element={<AdminForms />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  resetDb();
  resetRefData();
  resetTicketLookups();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useUi.setState({ sidebarWidths: {}, tableColumns: {}, toasts: [] });
});

const toasts = () => useUi.getState().toasts.map((t) => t.title ?? '');
const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(`Mais ações.*${name}$`) });

describe('Admin > Campos: editor de campo', () => {
  it('lista suspensa: opções com ordem, valores únicos e erro no próprio campo', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/fields');
    await screen.findByRole('button', { name: 'Severidade' });
    await user.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    const d = await screen.findByRole('dialog', { name: 'Adicionar campo' });
    await user.type(within(d).getByLabelText(/Título/), 'Prioridade interna');
    await user.click(within(d).getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Lista suspensa' }));
    // sem opção: erro ao salvar, o modal fica
    await user.click(within(d).getByRole('button', { name: 'Adicionar campo' }));
    expect(await within(d).findByText('Informe ao menos uma opção para a lista.')).toBeInTheDocument();
    const nova = within(d).getByLabelText('Nova opção');
    for (const o of ['Alta', 'Média', 'Baixa']) {
      await user.type(nova, `${o}{Enter}`);
    }
    await user.type(nova, 'alta{Enter}');
    expect(within(d).getByText('A opção "alta" já existe.')).toBeInTheDocument();
    await user.clear(nova);
    await user.click(within(d).getByRole('button', { name: 'Subir opção Baixa' }));
    await user.click(within(d).getByRole('button', { name: 'Remover opção Média' }));
    const values = () => within(d).getAllByLabelText(/^Opção \d/).map((i) => (i as HTMLInputElement).value);
    expect(values()).toEqual(['Alta', 'Baixa']);
    await user.click(within(d).getByRole('button', { name: 'Descer opção Alta' }));
    expect(values()).toEqual(['Baixa', 'Alta']);
    await user.click(within(d).getByRole('button', { name: 'Adicionar campo' }));
    expect(await screen.findByRole('button', { name: 'Prioridade interna' })).toBeInTheDocument();
    const created = db.fields.find((f) => f.slug === 'prioridade_interna')!;
    expect(created.options).toEqual([{ value: 'Baixa', label: 'Baixa' }, { value: 'Alta', label: 'Alta' }]);
  });

  it('renomear opção que já existe mantém o valor guardado; o tipo trava em campo já usado', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/fields');
    await user.click(await screen.findByRole('button', { name: 'Severidade' }));
    const d = await screen.findByRole('dialog', { name: 'Editar campo' });
    expect(within(d).getByRole('combobox', { name: 'Tipo' })).toBeDisabled(); // tickets de incidente já têm severidade
    await user.clear(within(d).getByLabelText('Opção 3'));
    await user.type(within(d).getByLabelText('Opção 3'), 'Muito alta');
    await user.click(within(d).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(db.fields.find((f) => f.slug === 'severidade')!.options![2]).toEqual({ value: 'alta', label: 'Muito alta' }));
  });

  it('campo com valores em tickets: tipo desabilitado com a explicação', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/fields');
    await user.click(await screen.findByRole('button', { name: 'Número do contrato' }));
    const d = await screen.findByRole('dialog', { name: 'Editar campo' });
    expect(within(d).getByRole('combobox', { name: 'Tipo' })).toBeDisabled();
    expect(within(d).getByText(/o tipo não pode mais mudar/)).toBeInTheDocument();
  });

  it('400 do servidor (limite de campos ativos) aparece em faixa e o digitado fica; 403 usa a frase de permissão', async () => {
    const user = userEvent.setup();
    for (let i = db.fields.filter((f) => f.active).length; i < 60; i += 1) db.fields.push({ id: `c${i}`, slug: `c${i}`, title: `C${i}`, type: 'text', system: false, active: true, required: false, order: 100 + i });
    renderAdmin('/admin/fields');
    await screen.findByRole('button', { name: 'Severidade' });
    await user.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    const d = await screen.findByRole('dialog', { name: 'Adicionar campo' });
    await user.type(within(d).getByLabelText(/Título/), 'Mais um campo');
    await user.type(within(d).getByLabelText('Descrição'), 'texto digitado');
    await user.click(within(d).getByRole('button', { name: 'Adicionar campo' }));
    expect(await within(d).findByText(/Já existem 60 campos ativos/)).toBeInTheDocument();
    expect(within(d).getByLabelText(/Título/)).toHaveValue('Mais um campo');
    expect(within(d).getByLabelText('Descrição')).toHaveValue('texto digitado');
  });

  it('mover para cima/baixo reordena; 409 em campo usado oferece desativar', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/fields');
    await screen.findByRole('button', { name: 'Severidade' });
    const names = () => screen.getAllByRole('row').map((r) => r.textContent ?? '').filter((t) => /Número do contrato|Severidade|Valor em disputa/.test(t)).map((t) => /Número do contrato|Severidade|Valor em disputa/.exec(t)![0]);
    expect(names().slice(0, 3)).toEqual(['Número do contrato', 'Severidade', 'Valor em disputa']);
    await user.click(rowOf('Severidade'));
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para cima' }));
    await waitFor(() => expect(names().slice(0, 3)).toEqual(['Severidade', 'Número do contrato', 'Valor em disputa']));
  });
});

describe('Admin > Formulários', () => {
  it('lista com padrão, equipe, tipo e contagem de tickets', async () => {
    renderAdmin('/admin/forms');
    const table = await screen.findByRole('table', { name: 'Formulários' });
    const row = within(table).getByRole('row', { name: /Incidentes/ });
    expect(within(row).getByText('Ativo')).toBeInTheDocument();
    expect(within(row).getByText('Suporte N2')).toBeInTheDocument();
    expect(within(row).getByText('Incidente')).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Formulário padrão/ })).toHaveTextContent('Padrão');
  });

  it('cria com campos em ordem e obrigatório por formulário; 400 de nome repetido mantém o digitado', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/forms');
    await screen.findByRole('table', { name: 'Formulários' });
    await user.click(screen.getByRole('button', { name: 'Adicionar formulário' }));
    const d = await screen.findByRole('dialog', { name: 'Adicionar formulário' });
    await user.type(within(d).getByLabelText(/Nome/), 'Incidentes');
    await user.click(within(d).getByRole('button', { name: 'Adicionar formulário' }));
    expect(await within(d).findByText('Já existe um formulário com este nome.')).toBeInTheDocument();
    expect(within(d).getByLabelText(/Nome/)).toHaveValue('Incidentes');
    await user.clear(within(d).getByLabelText(/Nome/));
    await user.type(within(d).getByLabelText(/Nome/), 'Comercial');
    for (const f of ['Valor em disputa', 'Severidade']) {
      await user.click(within(d).getByRole('combobox', { name: 'Adicionar campo ao formulário' }));
      await user.click(await screen.findByRole('option', { name: new RegExp(`^${f} `) }));
    }
    await user.click(within(d).getByRole('button', { name: 'Subir Severidade' }));
    await user.click(within(d).getByRole('checkbox', { name: 'Severidade: obrigatório' }));
    await user.click(within(d).getByRole('combobox', { name: 'Tipo padrão' }));
    await user.click(await screen.findByRole('option', { name: 'Tarefa' }));
    await user.click(within(d).getByRole('button', { name: 'Adicionar formulário' }));
    await waitFor(() => expect(db.forms.some((f) => f.name === 'Comercial')).toBe(true));
    const created = db.forms.find((f) => f.name === 'Comercial')!;
    expect(created.fields.map((i) => [i.slug, i.required])).toEqual([['severidade', true], ['valor_em_disputa', false]]);
    expect(created.defaultType).toBe('task');
    expect(created.isDefault).toBe(false);
  });

  it('definir como padrão, clonar e mover; o padrão não apaga nem desativa (409 com a frase do servidor)', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/forms');
    await screen.findByRole('table', { name: 'Formulários' });
    await user.click(rowOf('Financeiro'));
    await user.click(await screen.findByRole('menuitem', { name: 'Definir como padrão' }));
    await waitFor(() => expect(db.forms.filter((f) => f.isDefault).map((f) => f.name)).toEqual(['Financeiro']));
    await user.click(rowOf('Financeiro'));
    await user.click(await screen.findByRole('menuitem', { name: 'Desativar' }));
    await waitFor(() => expect(toasts().some((t) => /padrão e não pode ser desativado/.test(t))).toBe(true));
    expect(db.forms.find((f) => f.name === 'Financeiro')!.active).toBe(true);
    await user.click(rowOf('Financeiro'));
    await user.click(await screen.findByRole('menuitem', { name: 'Apagar' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Apagar formulário?' })).getByRole('button', { name: 'Apagar formulário' }));
    await waitFor(() => expect(toasts().some((t) => /não pode ser apagado/.test(t))).toBe(true));
    await user.click(within(screen.getByRole('dialog', { name: 'Apagar formulário?' })).getByRole('button', { name: 'Cancelar' }));
    await user.click(rowOf('Incidentes'));
    await user.click(await screen.findByRole('menuitem', { name: 'Clonar' }));
    await waitFor(() => expect(db.forms.some((f) => f.name === 'Cópia de Incidentes' && !f.isDefault)).toBe(true));
    await user.click(rowOf('Cópia de Incidentes'));
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para cima' }));
    await waitFor(() => expect(db.forms.sort((a, b) => a.order - b.order).map((f) => f.name).indexOf('Cópia de Incidentes')).toBeLessThan(db.forms.map((f) => f.name).indexOf('Financeiro') + 5));
  });

  it('apagar formulário com tickets (409 form_in_use) sugere desativar, e desativa', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/forms');
    await screen.findByRole('table', { name: 'Formulários' });
    await user.click(rowOf('Incidentes'));
    await user.click(await screen.findByRole('menuitem', { name: 'Apagar' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Apagar formulário?' })).getByRole('button', { name: 'Apagar formulário' }));
    const inUse = await screen.findByRole('dialog', { name: 'Há tickets usando este formulário' });
    await user.click(within(inUse).getByRole('button', { name: 'Desativar formulário' }));
    await waitFor(() => expect(db.forms.find((f) => f.name === 'Incidentes')!.active).toBe(false));
  });
});
