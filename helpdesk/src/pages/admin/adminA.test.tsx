import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as announcementsApi from '@/api/announcements';
import * as backupsApi from '@/api/backups';
import { ApiError } from '@/api/errors';
import * as slaApi from '@/api/sla';
import { resetAdminAMock } from '@/api/mock/adminA';
import { AnnouncementBanner } from '@/components/admin/announcements/AnnouncementBanner';
import { validateWindows, summarizeWindows } from '@/components/admin/calendars/calendarUtils';
import { TooltipProvider } from '@/components/ui';
import { useUi } from '@/store/useUi';
import AdminAnnouncements from './Announcements';
import AdminBackups from './Backups';
import AdminCalendars from './Calendars';
import AdminPlans from './Plans';
import AdminSla from './Sla';

function renderAt(path: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/sla/*" element={<AdminSla />} />
          <Route path="/admin/calendarios/*" element={<AdminCalendars />} />
          <Route path="/admin/planos/*" element={<AdminPlans />} />
          <Route path="/admin/backups/*" element={<AdminBackups />} />
          <Route path="/admin/avisos/*" element={<AdminAnnouncements />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  resetAdminAMock();
  useUi.setState({ tableColumns: {}, toasts: [] });
});
afterEach(() => vi.restoreAllMocks());

const rowOf = (name: RegExp | string) => screen.getByRole('row', { name });
const openMenu = async (user: ReturnType<typeof userEvent.setup>, row: HTMLElement, item: string) => {
  await user.click(within(row).getByRole('button', { name: /Mais ações/ }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
};

describe('SLA e prazos', () => {
  it('lista as políticas, cria uma nova e valida a solução menor que a primeira resposta', async () => {
    const user = userEvent.setup();
    renderAt('/admin/sla');
    expect(await screen.findByText('SLA Black (geral)')).toBeInTheDocument();
    expect(rowOf(/SLA Black \(geral\)/)).toHaveTextContent('2 h');

    await user.click(screen.getAllByRole('button', { name: 'Nova política' })[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Nova política de SLA' });
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText('Informe o nome da política.')).toBeInTheDocument();

    await user.type(within(dlg).getByRole('textbox', { name: /Nome/ }), 'AG-adminA SLA');
    await user.clear(within(dlg).getByLabelText('Meta de primeira resposta: valor'));
    await user.type(within(dlg).getByLabelText('Meta de primeira resposta: valor'), '10');
    await user.clear(within(dlg).getByLabelText('Meta de solução: valor'));
    await user.type(within(dlg).getByLabelText('Meta de solução: valor'), '5');
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText('O prazo de solução não pode ser menor que o de primeira resposta.')).toBeInTheDocument();

    await user.clear(within(dlg).getByLabelText('Meta de solução: valor'));
    await user.type(within(dlg).getByLabelText('Meta de solução: valor'), '12');
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(rowOf(/AG-adminA SLA/)).toHaveTextContent('10 h');
  });

  it('metas por prioridade avisam que valem só neste navegador', async () => {
    const user = userEvent.setup();
    renderAt('/admin/sla');
    await user.click((await screen.findAllByRole('button', { name: 'Nova política' }))[0]!);
    const dlg = await screen.findByRole('dialog');
    await user.click(within(dlg).getByRole('button', { name: 'Definir' }));
    expect(within(dlg).getByText('Somente neste navegador')).toBeInTheDocument();
    expect(within(dlg).getByLabelText('Urgente: primeira resposta: valor')).toBeInTheDocument();
  });

  it('403 ao salvar mantém o drawer aberto com o que foi digitado e mostra a frase padrão', async () => {
    const user = userEvent.setup();
    vi.spyOn(slaApi, 'saveSlaPolicy').mockRejectedValueOnce(new ApiError('Você não tem permissão para esta ação.', { status: 403 }));
    renderAt('/admin/sla');
    await user.click((await screen.findAllByRole('button', { name: 'Nova política' }))[0]!);
    const dlg = await screen.findByRole('dialog');
    await user.type(within(dlg).getByRole('textbox', { name: /Nome/ }), 'Texto digitado');
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText('Você não tem permissão para esta ação.')).toBeInTheDocument();
    expect(within(dlg).getByRole('textbox', { name: /Nome/ })).toHaveValue('Texto digitado');
  });

  it('excluir pede confirmação e remove a linha', async () => {
    const user = userEvent.setup();
    renderAt('/admin/sla');
    await screen.findByText('SLA Gold (geral)');
    await openMenu(user, rowOf(/SLA Gold \(geral\)/), 'Excluir');
    const confirm = await screen.findByRole('dialog', { name: /Excluir|Desativar/ });
    expect(confirm).toHaveTextContent('Esta ação não pode ser desfeita');
    await user.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.queryByText('SLA Gold (geral)')).not.toBeInTheDocument());
  });
});

describe('Calendários e feriados', () => {
  it('utilitários: valida sobreposição e resume o expediente', () => {
    expect(validateWindows([{ weekday: 0, start: '09:00', end: '13:00' }, { weekday: 0, start: '12:00', end: '18:00' }])).toEqual({ 0: 'As faixas do mesmo dia não podem se sobrepor.' });
    expect(validateWindows([{ weekday: 1, start: '10:00', end: '09:00' }])[1]).toMatch(/depois do início/);
    expect(validateWindows([{ weekday: 0, start: '09:00', end: '12:00' }, { weekday: 0, start: '12:00', end: '18:00' }])).toEqual({});
    expect(summarizeWindows([0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '18:00' })))).toBe('seg a sex, 09:00–18:00');
    expect(summarizeWindows([])).toBe('Sem expediente');
  });

  it('lista, abre o editor visual e bloqueia faixa invertida', async () => {
    const user = userEvent.setup();
    renderAt('/admin/calendarios');
    expect(await screen.findByText('Horário comercial')).toBeInTheDocument();
    expect(rowOf(/Horário comercial/)).toHaveTextContent('seg a sex, 09:00–12:00 e 13:00–18:00');
    await user.click(screen.getByRole('button', { name: 'Horário comercial' }));
    expect(await screen.findByText('Horário de atendimento por dia da semana')).toBeInTheDocument();
    const end = screen.getByLabelText('Segunda-feira, faixa 1: fim');
    await user.clear(end);
    await user.type(end, '08:00');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('O fim da faixa precisa ser depois do início.')).toBeInTheDocument();
  });

  it('feriados: cria meio período com validação e avisa que a repetição anual é local', async () => {
    const user = userEvent.setup();
    renderAt('/admin/calendarios/feriados');
    expect(await screen.findByText('Véspera de Natal')).toBeInTheDocument();
    expect(rowOf(/Véspera de Natal/)).toHaveTextContent('Meio período, 09:00–12:00');
    await user.click(screen.getByRole('button', { name: 'Novo feriado' }));
    const dlg = await screen.findByRole('dialog', { name: 'Novo feriado' });
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText('Informe uma data válida.')).toBeInTheDocument();
    await user.type(within(dlg).getByLabelText(/Data/), '2026-12-31');
    await user.type(within(dlg).getByRole('textbox', { name: /Nome/ }), 'AG-adminA Réveillon');
    await user.click(within(dlg).getByRole('switch', { name: 'Repete todo ano' }));
    expect(within(dlg).getByText('Somente neste navegador')).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(rowOf(/AG-adminA Réveillon/)).toHaveTextContent('Todo ano');
  });

  it('data repetida no mesmo calendário: erro e o digitado continua lá', async () => {
    const user = userEvent.setup();
    renderAt('/admin/calendarios/feriados');
    await screen.findByText('Natal');
    await user.click(screen.getByRole('button', { name: 'Novo feriado' }));
    const dlg = await screen.findByRole('dialog', { name: 'Novo feriado' });
    await user.type(within(dlg).getByLabelText(/Data/), '2026-12-25');
    await user.type(within(dlg).getByRole('textbox', { name: /Nome/ }), 'Outro');
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText('Já existe um feriado nesta data neste calendário.')).toBeInTheDocument();
    expect(within(dlg).getByRole('textbox', { name: /Nome/ })).toHaveValue('Outro');
  });
});

describe('Planos', () => {
  it('lista os planos com franquias, gera o identificador a partir do nome e cria', async () => {
    const user = userEvent.setup();
    renderAt('/admin/planos');
    expect(await screen.findByText('Black')).toBeInTheDocument();
    expect(rowOf(/Black/)).toHaveTextContent('30 por mês');
    expect(rowOf(/Black/)).toHaveTextContent('10 h por mês');
    await user.click(screen.getAllByRole('button', { name: 'Novo plano' })[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Novo plano' });
    await user.type(within(dlg).getByRole('textbox', { name: /^Nome/ }), 'Diamante Prime');
    expect(within(dlg).getByRole('textbox', { name: /Identificador/ })).toHaveValue('diamante-prime');
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(rowOf(/Diamante Prime/)).toHaveTextContent('Ilimitada');
  });

  it('desativar explica que o plano em uso não é apagado', async () => {
    const user = userEvent.setup();
    renderAt('/admin/planos');
    await screen.findByText('Gold');
    await openMenu(user, rowOf(/^Gold/), 'Desativar');
    const confirm = await screen.findByRole('dialog', { name: /Excluir|Desativar/ });
    expect(confirm).toHaveTextContent('não são apagados');
    await user.click(within(confirm).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(rowOf(/^Gold/)).toHaveTextContent('Inativo'));
  });
});

describe('Backups', () => {
  it('lista com tipo e origem, mostra o último backup e cria um novo com progresso', async () => {
    const user = userEvent.setup();
    renderAt('/admin/backups');
    expect(await screen.findByText('resolv-20261022-230000.sql.gz')).toBeInTheDocument();
    expect(rowOf(/resolv-20261022-230000/)).toHaveTextContent('Agendado');
    expect(rowOf(/resolv-20261019-230001/)).toHaveTextContent('Externo');
    expect(screen.getByTestId('last-backup')).toHaveTextContent('Último backup');
    await user.click(screen.getByRole('button', { name: 'Criar backup agora' }));
    expect(await screen.findByRole('progressbar', { name: 'Backup em andamento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar backup agora' })).toBeDisabled();
  });

  it('RESTAURAR exige digitar o nome do backup e só então chama a API', async () => {
    const user = userEvent.setup();
    const restore = vi.spyOn(backupsApi, 'restoreBackup');
    renderAt('/admin/backups');
    await screen.findByText('resolv-20261022-230000.sql.gz');
    await openMenu(user, rowOf(/resolv-20261022-230000/), 'Restaurar...');
    const dlg = await screen.findByRole('dialog', { name: 'Restaurar backup' });
    expect(dlg).toHaveTextContent('substitui todos os dados atuais');
    const go = within(dlg).getByRole('button', { name: 'Restaurar backup' });
    expect(go).toBeDisabled();
    await user.type(within(dlg).getByRole('textbox'), 'resolv-20261022-23');
    expect(go).toBeDisabled();
    await user.click(go);
    expect(restore).not.toHaveBeenCalled();
    await user.clear(within(dlg).getByRole('textbox'));
    await user.type(within(dlg).getByRole('textbox'), 'resolv-20261022-230000.sql.gz');
    expect(go).toBeEnabled();
    await user.click(go);
    await waitFor(() => expect(restore).toHaveBeenCalledWith('resolv-20261022-230000.sql.gz'));
    expect(await screen.findByRole('progressbar', { name: 'Restauração em andamento' })).toBeInTheDocument();
  });

  it('erro na restauração (409) mostra o motivo no modal e mantém o que foi digitado', async () => {
    const user = userEvent.setup();
    vi.spyOn(backupsApi, 'restoreBackup').mockRejectedValueOnce(new ApiError('Já existe um backup ou restauração em andamento.', { status: 409 }));
    renderAt('/admin/backups');
    await screen.findByText('resolv-20261022-230000.sql.gz');
    await openMenu(user, rowOf(/resolv-20261022-230000/), 'Restaurar...');
    const dlg = await screen.findByRole('dialog', { name: 'Restaurar backup' });
    await user.type(within(dlg).getByRole('textbox'), 'resolv-20261022-230000.sql.gz');
    await user.click(within(dlg).getByRole('button', { name: 'Restaurar backup' }));
    expect(await within(dlg).findByText('Já existe um backup ou restauração em andamento.')).toBeInTheDocument();
    expect(within(dlg).getByRole('textbox')).toHaveValue('resolv-20261022-230000.sql.gz');
  });

  it('excluir pede confirmação; baixar usa a API e salva o arquivo', async () => {
    const user = userEvent.setup();
    const create = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const download = vi.spyOn(backupsApi, 'downloadBackup');
    renderAt('/admin/backups');
    await screen.findByText('resolv-20261022-230000.sql.gz');
    await openMenu(user, rowOf(/resolv-20261021-230000/), 'Baixar');
    await waitFor(() => expect(download).toHaveBeenCalledWith('resolv-20261021-230000.sql.gz'));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await openMenu(user, rowOf(/resolv-20261020-101530/), 'Excluir');
    const confirm = await screen.findByRole('dialog', { name: /Excluir|Desativar/ });
    await user.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.queryByText('resolv-20261020-101530.sql.gz')).not.toBeInTheDocument());
  });

  it('agendamento: semanal exige o dia da semana e salva', async () => {
    const user = userEvent.setup();
    renderAt('/admin/backups');
    await user.click(await screen.findByRole('tab', { name: 'Agendamento' }));
    expect(await screen.findByText(/Próxima execução prevista/)).toBeInTheDocument();
    expect(screen.getByLabelText('Retenção')).toHaveValue('30 dias');
    await user.click(screen.getByRole('combobox', { name: 'Frequência' }));
    await user.click(await screen.findByRole('option', { name: 'Uma vez por semana' }));
    expect(await screen.findByRole('combobox', { name: 'Dia da semana' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar agendamento' }));
    await waitFor(() => expect(useUi.getState().toasts.some((t) => t.title === 'Agendamento salvo')).toBe(true));
  });

  it('o histórico mostra o log de cada trabalho', async () => {
    const user = userEvent.setup();
    renderAt('/admin/backups');
    await user.click(await screen.findByRole('tab', { name: 'Histórico' }));
    await user.click((await screen.findAllByRole('button', { name: 'Ver log' }))[0]!);
    expect(await screen.findByText(/backup gravado/)).toBeInTheDocument();
  });
});

describe('Avisos', () => {
  it('gestão: lista vigentes, cria com público de equipes e exige destinatário', async () => {
    const user = userEvent.setup();
    renderAt('/admin/avisos');
    expect(await screen.findByText('Recesso de fim de ano')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Novo aviso' })[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Novo aviso' });
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText('Informe o título.')).toBeInTheDocument();
    await user.type(within(dlg).getByRole('textbox', { name: /Título/ }), 'AG-adminA Aviso');
    await user.type(within(dlg).getByRole('textbox', { name: /Mensagem/ }), 'Teste');
    await user.click(within(dlg).getByRole('combobox', { name: 'Quem vê' }));
    await user.click(await screen.findByRole('option', { name: 'Equipes específicas' }));
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText('Escolha pelo menos um destinatário.')).toBeInTheDocument();
    await user.click(within(dlg).getByRole('checkbox', { name: 'Suporte' }));
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(rowOf(/AG-adminA Aviso/)).toHaveTextContent('Equipes específicas: Suporte');
  });

  it('desativar não apaga: some dos vigentes e aparece no histórico como Desativado', async () => {
    const user = userEvent.setup();
    renderAt('/admin/avisos');
    await screen.findByText('Recesso de fim de ano');
    await openMenu(user, rowOf(/Recesso de fim de ano/), 'Desativar');
    const confirm = await screen.findByRole('dialog', { name: /Excluir|Desativar/ });
    expect(confirm).toHaveTextContent('continua no histórico');
    await user.click(within(confirm).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(screen.queryByText('Recesso de fim de ano')).not.toBeInTheDocument());
    await user.click(screen.getByRole('combobox', { name: 'Período' }));
    await user.click(await screen.findByRole('option', { name: /histórico/ }));
    expect(rowOf(/Recesso de fim de ano/)).toHaveTextContent('Desativado');
  });

  it('AnnouncementBanner mostra os avisos do usuário e dispensa um a um', async () => {
    const user = userEvent.setup();
    const dismiss = vi.spyOn(announcementsApi, 'dismissAnnouncement');
    render(<AnnouncementBanner />);
    const region = await screen.findByRole('region', { name: 'Avisos' });
    expect(within(region).getByText(/Recesso de fim de ano/)).toBeInTheDocument();
    await user.click(within(region).getAllByRole('button', { name: /Dispensar/ })[0]!);
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(screen.queryByText(/Recesso de fim de ano/)).not.toBeInTheDocument());
  });

  it('AnnouncementBanner não renderiza nada quando a leitura falha', async () => {
    vi.spyOn(announcementsApi, 'listAnnouncements').mockRejectedValueOnce(new ApiError('x', { status: 500 }));
    const { container } = render(<AnnouncementBanner />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
