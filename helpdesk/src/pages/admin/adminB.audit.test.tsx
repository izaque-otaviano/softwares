import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureApi } from '@/api';
import { TooltipProvider } from '@/components/ui';
import { useUi } from '@/store/useUi';
import AdminAudit from './Audit';
import AdminLgpd from './Lgpd';
import AdminRetention from './Retention';

const Loc = () => <div data-testid="loc">{useLocation().pathname}</div>;

function renderAt(path: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Loc />
        <Routes>
          <Route path="/admin/auditoria/*" element={<AdminAudit />} />
          <Route path="/admin/retencao/*" element={<AdminRetention />} />
          <Route path="/admin/lgpd/*" element={<AdminLgpd />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useUi.setState({ tableColumns: {}, toasts: [] });
});

describe('Registros de auditoria', () => {
  it('lista com paginação do servidor e avança de página', async () => {
    const user = userEvent.setup();
    renderAt('/admin/auditoria');
    expect(await screen.findByText('1–25 de 57')).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBe(26);
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByText('26–50 de 57')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(await screen.findByText('1–25 de 57')).toBeInTheDocument();
  });

  it('filtro por ação volta ao início e reduz a lista', async () => {
    const user = userEvent.setup();
    renderAt('/admin/auditoria');
    await screen.findByText('1–25 de 57');
    await user.click(screen.getByRole('combobox', { name: 'Filtrar por ação' }));
    await user.click(await screen.findByRole('option', { name: 'Exportação' }));
    expect(await screen.findByText('1–7 de 7')).toBeInTheDocument();
  });

  it('abre o detalhe em gaveta com os campos alterados', async () => {
    const user = userEvent.setup();
    renderAt('/admin/auditoria');
    await screen.findByText('1–25 de 57');
    await user.click(screen.getAllByText('Prioridade alterada', { selector: 'td' })[0]!);
    const drawer = await screen.findByRole('dialog', { name: 'Detalhe do registro' });
    expect(within(drawer).getByText('Campos alterados')).toBeInTheDocument();
    expect(await within(drawer).findByText('Normal → Alta')).toBeInTheDocument();
  });

  it('aba de acessos a tickets muda a rota e filtra somente os negados', async () => {
    const user = userEvent.setup();
    renderAt('/admin/auditoria');
    await user.click(screen.getByRole('tab', { name: 'Acessos a tickets' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/admin/auditoria/acessos');
    expect(await screen.findByText('1–25 de 31')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Somente acessos negados' }));
    expect(await screen.findByText('1–7 de 7')).toBeInTheDocument();
    expect(screen.getAllByText('Negado').length).toBeGreaterThan(0);
  });
});

describe('Retenção de dados', () => {
  it('simular não apaga: cria um ciclo de simulação e mostra "Seriam apagados"', async () => {
    const user = userEvent.setup();
    renderAt('/admin/retencao');
    expect(await screen.findByText(/Resultado do ciclo #2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simular agora' }));
    const dlg = await screen.findByRole('dialog', { name: 'Simular retenção agora' });
    expect(within(dlg).getByText(/Nada é apagado/)).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Simular' }));
    expect(await screen.findByText(/Resultado do ciclo #3 \(simulação/)).toBeInTheDocument();
    expect(screen.getAllByText('Seriam apagados').length).toBeGreaterThan(0);
  });

  it('revisão exige digitar o código e só então registra', async () => {
    const user = userEvent.setup();
    renderAt('/admin/retencao');
    await screen.findByText(/Resultado do ciclo/);
    await user.click(screen.getByText('#2', { selector: 'td' }));
    const drawer = await screen.findByRole('dialog', { name: 'Simulação #2' });
    await user.click(await within(drawer).findByRole('button', { name: 'Registrar revisão' }));
    const confirm = await screen.findByRole('dialog', { name: 'Registrar revisão da simulação' });
    const submit = within(confirm).getByRole('button', { name: 'Registrar revisão' });
    expect(submit).toBeDisabled();
    await user.type(within(confirm).getByRole('textbox', { name: 'Digite REVISAR-2 para confirmar' }), 'REVISAR-2');
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Simulação #2' })).queryByRole('button', { name: 'Registrar revisão' })).not.toBeInTheDocument());
    expect(within(screen.getByRole('dialog', { name: 'Simulação #2' })).getByText(/Você, /)).toBeInTheDocument();
  });
});

describe('LGPD: fila e ações irreversíveis', () => {
  it('lista pedidos, mostra prazo vencido e filtra por estado na página', async () => {
    const user = userEvent.setup();
    renderAt('/admin/lgpd');
    expect(await screen.findByText('LGPD-1')).toBeInTheDocument();
    expect(screen.getByText('Atrasado há 2 dias')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }));
    await user.click(await screen.findByRole('option', { name: 'Concluído' }));
    expect(screen.getByText('LGPD-2')).toBeInTheDocument();
    expect(screen.queryByText('LGPD-1')).not.toBeInTheDocument();
  });

  it('redigir candidato pede o identificador e avisa que é irreversível', async () => {
    const user = userEvent.setup();
    renderAt('/admin/lgpd');
    await user.click(await screen.findByText('LGPD-3'));
    const drawer = await screen.findByRole('dialog', { name: 'Pedido LGPD-3' });
    await user.click(await within(drawer).findByRole('button', { name: 'Redigir CPF em TD-00031' }));
    const confirm = await screen.findByRole('dialog', { name: 'Redigir trecho' });
    expect(within(confirm).getByText(/IRREVERSÍVEL/)).toBeInTheDocument();
    const submit = within(confirm).getByRole('button', { name: 'Redigir definitivamente' });
    expect(submit).toBeDisabled();
    await user.type(within(confirm).getByRole('textbox', { name: 'Digite LGPD-3 para confirmar' }), 'LGPD-3');
    await user.click(submit);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Redigir trecho' })).not.toBeInTheDocument());
  });

  it('anonimizar: só libera depois de digitar o identificador, e o texto avisa que não há volta', async () => {
    const user = userEvent.setup();
    renderAt('/admin/lgpd');
    await user.click(await screen.findByText('LGPD-3'));
    const drawer = await screen.findByRole('dialog', { name: 'Pedido LGPD-3' });
    await user.click(within(drawer).getByRole('button', { name: 'Anonimizar dados' }));
    const confirm = await screen.findByRole('dialog', { name: 'Anonimizar dados do titular' });
    expect(within(confirm).getByText(/IRREVERSÍVEL/)).toBeInTheDocument();
    const submit = within(confirm).getByRole('button', { name: 'Anonimizar definitivamente' });
    const input = within(confirm).getByRole('textbox', { name: 'Digite LGPD-3 para confirmar' });
    expect(submit).toBeDisabled();
    await user.type(input, 'LGPD-4');
    expect(submit).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'LGPD-3');
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Pedido LGPD-3' })).getByText('Concluído')).toBeInTheDocument());
  });

  it('pedido pendente: anonimização bloqueada até verificar; verificar libera; rejeitar exige motivo', async () => {
    const user = userEvent.setup();
    renderAt('/admin/lgpd');
    await user.click(await screen.findByText('LGPD-4'));
    const drawer = await screen.findByRole('dialog', { name: 'Pedido LGPD-4' });
    expect(within(drawer).getByRole('button', { name: 'Anonimizar dados' })).toBeDisabled();
    expect(within(drawer).getByText('Anonimização exige verificação de identidade antes de executar.')).toBeInTheDocument();
    // redigir só depois de verificar
    expect(await within(drawer).findByRole('button', { name: /Redigir CPF/ })).toBeDisabled();

    await user.type(within(drawer).getByRole('textbox', { name: /Como a identidade foi confirmada/ }), 'Documento conferido por videochamada');
    await user.click(within(drawer).getByRole('button', { name: 'Registrar verificação' }));
    await user.click(await screen.findByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Pedido LGPD-4' })).getByRole('button', { name: 'Anonimizar dados' })).toBeEnabled());
    expect(within(screen.getByRole('dialog', { name: 'Pedido LGPD-4' })).getByRole('button', { name: /Redigir CPF/ })).toBeEnabled();

    await user.click(within(screen.getByRole('dialog', { name: 'Pedido LGPD-4' })).getByRole('button', { name: 'Rejeitar pedido' }));
    const reject = await screen.findByRole('dialog', { name: 'Rejeitar pedido' });
    await user.click(within(reject).getByRole('button', { name: 'Rejeitar pedido' }));
    expect(await within(reject).findByText(/Informe o motivo da negativa/)).toBeInTheDocument();
    await user.type(within(reject).getByRole('textbox', { name: /Motivo da negativa/ }), 'Não foi possível confirmar quem pediu');
    await user.click(within(reject).getByRole('button', { name: 'Rejeitar pedido' }));
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Pedido LGPD-4' })).getByText('Rejeitado')).toBeInTheDocument());
  });
});

describe('Permissão das telas de auditoria', () => {
  it('no modo real exige settings.manage (a mesma permissão da API)', async () => {
    const { userCan } = await import('@/lib/permissions');
    const { AUDIT_ACCESS } = await import('@/components/admin/audit/adminAccess');
    expect(userCan({ permissions: ['ticket.reply'] }, AUDIT_ACCESS, true)).toBe(false);
    expect(userCan({ permissions: ['settings.manage'] }, AUDIT_ACCESS, true)).toBe(true);
    expect(userCan(null, AUDIT_ACCESS, true)).toBe(false);
  });
});
