import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartialUpdateError } from '@/api/errors';
import { resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import { useFormStore } from './formStore';

/**
 * Falha PARCIAL no envio (backend real, várias chamadas sem transação): o formulário mantém o texto que ainda não
 * foi gravado, trata como aplicado o que o servidor já aceitou e o "Tentar novamente" repete SÓ o que falta.
 * Aqui `updateTicket`/`createTicket` da store simulam o que a camada real lança.
 */
const F = () => useFormStore.getState();

beforeEach(async () => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useFormStore.setState({ forms: {} });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useUi.setState({ toasts: [] });
  useTickets.setState({ loaded: false, tickets: [], counts: {} });
  await useTickets.getState().load();
});

function open() {
  const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me')!;
  useTabs.getState().openTab({ kind: 'ticket', refId: t.id, title: t.subject });
  const key = `ticket:${t.id}`;
  F().init(key, t);
  return { t, key };
}

describe('formStore: falha parcial', () => {
  it('propriedades aplicadas e mensagem recusada: texto mantido, original ajustado, retry sem repetir as propriedades', async () => {
    const { t, key } = open();
    F().patch(key, { priority: 'urgent', tags: ['vip'] });
    F().setBody(key, '<p>minha resposta</p>');
    const applied = { ...t, priority: 'urgent' as const, tags: ['vip'] };
    const spy = vi.fn().mockRejectedValueOnce(
      new PartialUpdateError('Texto recusado.', { appliedKeys: ['priority', 'tags'], pendingKeys: [], appliedLabels: ['prioridade', 'etiquetas'], pendingLabels: ['mensagem'], ticket: applied, commentSent: false }),
    );
    useTickets.setState({ updateTicket: spy });

    const r = await F().submit(key);
    expect(r).toMatchObject({ ok: false, kind: 'api' });
    const e = F().forms[key]!;
    expect(e.apiError).toBe('Aplicado: prioridade, etiquetas. Não aplicado: mensagem. Motivo: Texto recusado.');
    expect(e.bodyHtml).toBe('<p>minha resposta</p>');
    expect(e.original.priority).toBe('urgent');
    expect(e.original.tags).toEqual(['vip']);
    expect(e.submitting).toBe(false);
    expect(useUi.getState().toasts.some((x) => x.title.includes('foi atualizado'))).toBe(false);

    // Tentar novamente: o patch enviado agora é VAZIO (prioridade/etiquetas já valem) e a mensagem segue junto.
    spy.mockResolvedValueOnce({ ...applied, comments: [] });
    await F().retry(key);
    const [, patch, comment] = spy.mock.calls[1]!;
    expect(patch).toEqual({});
    expect(comment).toMatchObject({ public: true, bodyHtml: '<p>minha resposta</p>' });
  });

  it('mensagem já gravada e estágio pendente: o editor esvazia (não reenvia) e só o status falta', async () => {
    const { t, key } = open();
    const target = useTickets.getState().statuses.find((s) => s.id !== t.statusId && s.category === 'open')!;
    F().patch(key, { statusId: target.id });
    F().setBody(key, '<p>enviei</p>');
    const spy = vi.fn().mockRejectedValueOnce(
      new PartialUpdateError('Erro interno.', { appliedKeys: ['statusId'], pendingKeys: ['statusId'], appliedLabels: ['mensagem'], pendingLabels: ['status'], ticket: t, commentSent: true }),
    );
    useTickets.setState({ updateTicket: spy });
    await F().submit(key);
    const e = F().forms[key]!;
    expect(e.bodyHtml).toBe('');
    expect(e.original.statusId).toBe(t.statusId); // status NÃO conta como aplicado
    expect(e.values.statusId).toBe(target.id);
    spy.mockResolvedValueOnce(t);
    await F().retry(key);
    const [, patch, comment] = spy.mock.calls[1]!;
    expect(patch).toEqual({ statusId: target.id });
    expect(comment).toBeUndefined();
  });

  it('ticket novo: falha depois de criar converte a aba para o ticket criado; repetir atualiza (não cria outro)', async () => {
    useTabs.getState().openTab({ kind: 'new-ticket', refId: '1', title: 'Novo ticket' });
    F().init('new-ticket:1', null);
    F().patch('new-ticket:1', { subject: 'S', requesterId: 'u1', assigneeGroupId: 'g1', tags: ['vip'] });
    F().setBody('new-ticket:1', '<p>desc</p>');
    const t = useTickets.getState().tickets[0]!;
    const created = { ...t, id: 999, subject: 'S', tags: [] };
    const create = vi.fn().mockRejectedValueOnce(
      new PartialUpdateError('Agente não encontrado.', { appliedKeys: [], pendingKeys: ['tags'], appliedLabels: ['ticket #999 criado'], pendingLabels: ['etiquetas'], ticket: created, created: true, commentSent: true }),
    );
    const update = vi.fn().mockResolvedValueOnce({ ...created, tags: ['vip'] });
    useTickets.setState({ createTicket: create, updateTicket: update });
    await F().submit('new-ticket:1');
    expect(F().forms['new-ticket:1']).toBeUndefined();
    const e = F().forms['ticket:999']!;
    expect(e).toMatchObject({ isNew: false, ticketId: 999, bodyHtml: '' });
    expect(e.values.tags).toEqual(['vip']);
    expect(e.original.tags).toEqual([]);
    expect(useTabs.getState().tabs.some((x) => x.id === 'ticket:999')).toBe(true);
    await F().retry('ticket:999');
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0]).toBe(999);
    expect(update.mock.calls[0]![1]).toMatchObject({ tags: ['vip'] });
    expect(update.mock.calls[0]![2]).toBeUndefined(); // a descrição já foi gravada na criação
  });

  it('erro simples (sem parcial) mantém tudo e mostra a mensagem do backend', async () => {
    const { key } = open();
    F().setBody(key, '<p>x</p>');
    useTickets.setState({ updateTicket: vi.fn().mockRejectedValueOnce(new Error('Você não tem permissão para esta ação.')) });
    await F().submit(key);
    expect(F().forms[key]!.apiError).toBe('Você não tem permissão para esta ação.');
    expect(F().forms[key]!.bodyHtml).toBe('<p>x</p>');
  });

  it('anexos e macros ficam no formulário e viajam no envio; limpam depois do sucesso', async () => {
    const { t, key } = open();
    const file = new File(['x'], 'a.txt');
    F().addFiles(key, [file]);
    F().setBody(key, '<p>com anexo</p>');
    const spy = vi.fn().mockResolvedValue(t);
    useTickets.setState({ updateTicket: spy });
    await F().submit(key);
    expect(spy.mock.calls[0]![2]).toMatchObject({ files: [file] });
    expect(F().forms[key]!.files).toEqual([]);
    F().addFiles(key, [file, file]);
    F().removeFile(key, 0);
    expect(F().forms[key]!.files).toHaveLength(1);
  });
});
