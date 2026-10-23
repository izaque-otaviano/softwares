import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toApiError } from '@/api/real/http';
import { TooltipProvider } from '@/components/ui';
import { useTickets } from '@/store/useTickets';
import type { TicketStatus } from '@/types/domain';
import { StatusModal } from './StatusModal';

const custom: TicketStatus = { id: '9', category: 'open', agentName: 'Em andamento', agentDescription: '', endUserName: 'Em andamento', color: '#2E7D32', active: true, system: false, ticketCount: 0 };

function renderModal(status: TicketStatus | null, onOpenChange = vi.fn()) {
  return render(
    <TooltipProvider>
      <StatusModal open status={status} onOpenChange={onOpenChange} />
    </TooltipProvider>,
  );
}

const save = vi.fn();
beforeEach(() => {
  save.mockReset();
  useTickets.setState({ saveStatus: save });
});

describe('StatusModal: erros do backend no formulário', () => {
  it('nome repetido (400): a mensagem aparece no campo, o modal fica aberto e nada digitado se perde', async () => {
    save.mockRejectedValue(toApiError(400, { name: ['Já existe o status "Aberto". Escolha um nome diferente.'] }));
    const onOpenChange = vi.fn();
    renderModal(null, onOpenChange);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Nome do status para o agente/), 'Aberto');
    await user.type(screen.getByLabelText(/Nome do status para o usuário final/), 'Aberto p/ cliente');
    await user.type(screen.getByLabelText(/Descrição para o agente/), 'minha descrição');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByText('Já existe o status "Aberto". Escolha um nome diferente.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome do status para o agente/)).toHaveValue('Aberto');
    expect(screen.getByLabelText(/Nome do status para o usuário final/)).toHaveValue('Aberto p/ cliente');
    expect(screen.getByLabelText(/Descrição para o agente/)).toHaveValue('minha descrição');
    expect(screen.getByLabelText(/Nome do status para o agente/)).toBeInvalid();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('corrigir o nome limpa o erro do campo e salva de novo', async () => {
    save.mockRejectedValueOnce(toApiError(400, { name: ['Já existe o status "Aberto".'] }));
    save.mockResolvedValueOnce({ ...custom, agentName: 'Aberto 2' });
    const onOpenChange = vi.fn();
    renderModal(null, onOpenChange);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Nome do status para o agente/), 'Aberto');
    await user.type(screen.getByLabelText(/Nome do status para o usuário final/), 'Aberto');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    await screen.findByText('Já existe o status "Aberto".');
    await user.type(screen.getByLabelText(/Nome do status para o agente/), ' 2');
    expect(screen.queryByText('Já existe o status "Aberto".')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('categoria recusada por tickets em uso (400) aparece no campo Categoria', async () => {
    const msg = '3 chamado(s) usam este status. Crie o status na categoria certa e mova os tickets.';
    save.mockRejectedValue(toApiError(400, { category: [msg] }));
    renderModal({ ...custom, ticketCount: 0 }); // o front ainda não sabia (contagem velha): o backend decide
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome do status para o agente/)).toHaveValue('Em andamento');
  });

  it('erro geral (permissão) aparece em faixa, com o texto mantido', async () => {
    save.mockRejectedValue(toApiError(403, { detail: 'Apenas administradores.' }));
    renderModal(custom);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/Você não tem permissão para esta ação/)).toBeInTheDocument();
    expect(screen.getByText(/O que você digitou foi mantido/)).toBeInTheDocument();
  });
});

describe('StatusModal: o que o backend recusa já vem explicado', () => {
  it('status de fábrica: categoria travada com a explicação', () => {
    renderModal({ ...custom, id: '2', system: true, agentName: 'Aberto' });
    expect(screen.getByText('Status de fábrica: não pode ser desativado nem mudar de categoria.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Categoria do status/ })).toBeDisabled();
  });

  it('status personalizado em uso: categoria travada com a contagem', () => {
    renderModal({ ...custom, ticketCount: 2 });
    expect(screen.getByText(/2 tickets usam este status, então a categoria não pode mudar/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Categoria do status/ })).toBeDisabled();
  });

  it('status personalizado sem tickets: categoria livre', () => {
    renderModal(custom);
    expect(screen.getByRole('combobox', { name: /Categoria do status/ })).toBeEnabled();
  });
});
