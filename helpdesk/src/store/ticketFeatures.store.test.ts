import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ticketsApi from '@/api/tickets';
import { resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { ApiError } from '@/api/errors';
import { useAiSummary } from './useAiSummary';
import { useTickets } from './useTickets';
import { useUi } from './useUi';

// A fachada é trocada por funções espiáveis que, por padrão, chamam a implementação do mock.
vi.mock('@/api/tickets', async (orig) => {
  const m = await orig<typeof import('@/api/tickets')>();
  return { ...m, deleteTickets: vi.fn(m.deleteTickets), restoreTicket: vi.fn(m.restoreTicket), generateAiSummary: vi.fn(m.generateAiSummary), runView: vi.fn(m.runView) };
});

const real = async () => await vi.importActual<typeof import('@/api/tickets')>('@/api/tickets');

beforeEach(async () => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useUi.setState({ toasts: [] });
  useAiSummary.setState({ byTicket: {} });
  useTickets.setState({ loaded: false, tickets: [], counts: {}, viewIds: {}, viewMeta: {}, viewType: {} });
  const impl = await real();
  vi.mocked(ticketsApi.deleteTickets).mockImplementation(impl.deleteTickets);
  vi.mocked(ticketsApi.restoreTicket).mockImplementation(impl.restoreTicket);
  vi.mocked(ticketsApi.generateAiSummary).mockImplementation(impl.generateAiSummary);
  await useTickets.getState().load();
});
afterEach(() => vi.clearAllMocks());

const toasts = () => useUi.getState().toasts;

describe('apagar: só sai da tela o que o servidor confirmou', () => {
  it('sucesso: remove da store e avisa', async () => {
    const id = useTickets.getState().tickets[0]!.id;
    expect(await useTickets.getState().deleteTickets([id])).toBe(true);
    expect(useTickets.getState().tickets.some((t) => t.id === id)).toBe(false);
    expect(toasts().at(-1)).toMatchObject({ tone: 'success', title: `Ticket #${id} apagado` });
  });

  it('403/404/409: o ticket NÃO some e a mensagem clara vai em toast com "Tentar novamente"', async () => {
    const id = useTickets.getState().tickets[0]!.id;
    const before = useTickets.getState().tickets.length;
    for (const [status, message] of [
      [403, 'Você não tem permissão para apagar tickets. Só administradores podem apagar o ticket #1.'],
      [404, `O ticket #${id} não foi encontrado: ele pode já ter sido apagado ou você não tem acesso a ele.`],
      [409, `O ticket #${id} não pode ser apagado: ele tem horas de manutenção lançadas.`],
    ] as const) {
      vi.mocked(ticketsApi.deleteTickets).mockResolvedValueOnce({ deleted: [], failed: [{ id, message, status }] });
      expect(await useTickets.getState().deleteTickets([id])).toBe(false);
      expect(useTickets.getState().tickets).toHaveLength(before);
      expect(toasts().at(-1)).toMatchObject({ tone: 'error', title: message });
      expect(toasts().at(-1)!.action?.label).toBe('Tentar novamente');
    }
  });

  it('parcial: tira só os apagados e lista os que ficaram', async () => {
    const [a, b] = useTickets.getState().tickets;
    vi.mocked(ticketsApi.deleteTickets).mockResolvedValueOnce({ deleted: [a!.id], failed: [{ id: b!.id, message: 'Horas lançadas.', status: 409, code: 'ticket_conflict' }] });
    expect(await useTickets.getState().deleteTickets([a!.id, b!.id])).toBe(false);
    const ids = useTickets.getState().tickets.map((t) => t.id);
    expect(ids).not.toContain(a!.id);
    expect(ids).toContain(b!.id);
    expect(toasts().at(-1)!.title).toBe(`1 de 2 tickets apagados. Não apagados: #${b!.id}. Horas lançadas.`);
  });

  it('erro de rede na chamada toda: nada some', async () => {
    const id = useTickets.getState().tickets[0]!.id;
    vi.mocked(ticketsApi.deleteTickets).mockRejectedValueOnce(new ApiError('Sem conexão com o servidor.', { status: 0 }));
    expect(await useTickets.getState().deleteTickets([id])).toBe(false);
    expect(useTickets.getState().tickets.some((t) => t.id === id)).toBe(true);
    expect(toasts().at(-1)).toMatchObject({ tone: 'error', title: 'Sem conexão com o servidor.' });
  });
});

describe('restaurar', () => {
  it('apagado e restaurado volta para a store, sem deletedAt', async () => {
    const id = useTickets.getState().tickets[0]!.id;
    await useTickets.getState().deleteTickets([id]);
    const detail = await useTickets.getState().loadDetail(id); // admin abre o apagado
    expect(detail.deletedAt).toBeTruthy();
    expect(useTickets.getState().ticketsForView('all-unsolved').some((t) => t.id === id)).toBe(false); // apagado não entra em lista nenhuma
    const restored = await useTickets.getState().restoreTicket(id);
    expect(restored?.deletedAt).toBeUndefined();
    expect(useTickets.getState().tickets.find((t) => t.id === id)?.deletedAt).toBeUndefined();
    expect(toasts().at(-1)!.title).toBe(`Ticket #${id} restaurado`);
  });

  it('falha (409, 30 dias): devolve null e mostra o motivo', async () => {
    vi.mocked(ticketsApi.restoreTicket).mockRejectedValueOnce(new ApiError('O ticket #4 foi apagado há mais de 30 dias e não pode mais ser restaurado.', { status: 409, code: 'ticket_conflict' }));
    expect(await useTickets.getState().restoreTicket(4)).toBeNull();
    expect(toasts().at(-1)).toMatchObject({ tone: 'error', title: expect.stringMatching(/mais de 30 dias/) });
  });

  it('applyServerTicket de um apagado (evento do servidor) tira da lista em vez de devolver', async () => {
    const t = useTickets.getState().tickets[0]!;
    useTickets.getState().applyServerTicket({ ...t, deletedAt: '2026-10-23T10:00:00Z' });
    expect(useTickets.getState().tickets.some((x) => x.id === t.id)).toBe(false);
  });
});

describe('tipo', () => {
  it('trocar o tipo no mock gera o evento "tipo → Tarefa" (e "—" ao limpar), como o servidor', async () => {
    const { id, type: current } = useTickets.getState().tickets[0]!;
    const next = current === 'task' ? 'question' : 'task';
    const label = next === 'task' ? 'Tarefa' : 'Pergunta';
    const a = await useTickets.getState().updateTicket(id, { type: next }, undefined, { silent: true });
    expect(a.type).toBe(next);
    const ev = a.events.find((e) => e.text === `tipo → ${label}`);
    expect(ev).toMatchObject({ kind: 'field_change' });
    expect(ev!.meta).toBeUndefined();
    const b = await useTickets.getState().updateTicket(id, { type: undefined }, undefined, { silent: true });
    expect(b.events.some((e) => e.text === 'tipo → —')).toBe(true);
  });

  it('loadView guarda o tipo aplicado no servidor e o "Carregar mais" o reaproveita', async () => {
    useTickets.setState({ viewMeta: { mine: { total: 300, loaded: 100, hasMore: true } }, viewIds: { mine: [1] }, viewType: { mine: 'incident' } });
    await useTickets.getState().loadMoreView('mine');
    expect(vi.mocked(ticketsApi.runView)).toHaveBeenCalledWith('mine', { offset: 1, type: 'incident' });
    await useTickets.getState().loadView('mine', { type: 'task,none' });
    expect(useTickets.getState().viewType.mine).toBe('task,none');
  });
});

describe('CC e seguidores na store (mock coerente com o servidor)', () => {
  it('addCc normaliza, não repete, recusa e-mail inválido e o do solicitante, e respeita o limite de 20', async () => {
    const t = useTickets.getState().tickets[0]!;
    const withCc = await useTickets.getState().addCc(t.id, { email: ' Fulano@Exemplo.com ', name: 'Fulano' });
    expect(withCc.ccList).toEqual([expect.objectContaining({ name: 'Fulano', email: 'fulano@exemplo.com' })]);
    expect(withCc.ccIds).toEqual(['fulano@exemplo.com']);
    expect(withCc.events.some((e) => e.text === 'cc + fulano@exemplo.com')).toBe(true);
    expect((await useTickets.getState().addCc(t.id, { email: 'FULANO@exemplo.com' })).ccList).toHaveLength(1);
    await expect(useTickets.getState().addCc(t.id, { email: 'ruim' })).rejects.toMatchObject({ status: 400, fieldErrors: { email: ['Insira um endereço de email válido.'] } });
    const requester = (await import('@/api/mock/db')).db.users.find((u) => u.id === t.requesterId)!;
    await expect(useTickets.getState().addCc(t.id, { email: requester.email })).rejects.toThrow(/solicitante/);
    for (let i = 1; i < 20; i++) await useTickets.getState().addCc(t.id, { email: `p${i}@exemplo.com` });
    await expect(useTickets.getState().addCc(t.id, { email: 'p99@exemplo.com' })).rejects.toThrow(/no máximo 20/);
    const id = useTickets.getState().tickets.find((x) => x.id === t.id)!.ccList![0]!.id;
    const removed = await useTickets.getState().removeCc(t.id, id);
    expect(removed.ccList).toHaveLength(19);
    expect(removed.events.some((e) => e.text === 'cc − fulano@exemplo.com')).toBe(true);
  });

  it('addFollower/removeFollower atualizam followerIds e o histórico; solicitante não pode seguir', async () => {
    const t = useTickets.getState().tickets[0]!;
    const added = await useTickets.getState().addFollower(t.id, 'a4');
    expect(added.followerIds).toContain('a4');
    expect(added.events.some((e) => /^seguidor \+ /.test(e.text))).toBe(true);
    await expect(useTickets.getState().addFollower(t.id, t.requesterId)).rejects.toThrow(/solicitante já acompanha/);
    const removed = await useTickets.getState().removeFollower(t.id, 'a4');
    expect(removed.followerIds).not.toContain('a4');
    await expect(useTickets.getState().removeFollower(t.id, 'a4')).rejects.toMatchObject({ status: 404 });
  });
});

describe('resumo de IA (só em memória)', () => {
  it('mock: gera o resumo simulado e o guarda só na store', async () => {
    const id = useTickets.getState().tickets[0]!.id;
    await useAiSummary.getState().generate(id);
    const e = useAiSummary.getState().byTicket[id]!;
    expect(e.status).toBe('done');
    expect(e.summary).toMatchObject({ provider: 'simulado', truncated: false });
    expect(e.summary!.summary).toMatch(/mensage/);
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(e.summary!.summary);
  });

  it('503 ai_not_configured fica como erro com o código (a tela o trata como aviso)', async () => {
    vi.mocked(ticketsApi.generateAiSummary).mockRejectedValueOnce(new ApiError('O resumo por IA não está configurado nesta conta.', { status: 503, code: 'ai_not_configured' }));
    await useAiSummary.getState().generate(7);
    expect(useAiSummary.getState().byTicket[7]).toMatchObject({ status: 'error', code: 'ai_not_configured', error: 'O resumo por IA não está configurado nesta conta.' });
  });

  it('gerar de novo mantém o resumo anterior enquanto carrega e dois cliques não duplicam a chamada', async () => {
    const id = 9;
    await useAiSummary.getState().generate(id);
    const first = useAiSummary.getState().byTicket[id]!.summary;
    const p1 = useAiSummary.getState().generate(id);
    expect(useAiSummary.getState().byTicket[id]).toMatchObject({ status: 'loading', summary: first });
    const p2 = useAiSummary.getState().generate(id);
    await Promise.all([p1, p2]);
    expect(vi.mocked(ticketsApi.generateAiSummary)).toHaveBeenCalledTimes(2);
  });
});
