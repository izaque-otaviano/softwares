import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import { useFormStore } from './formStore';

// Papel sem `ticket.edit_properties`: o POST de criação com `assignee` seria recusado inteiro pelo backend.
vi.mock('@/lib/permissions', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/permissions')>();
  return { ...mod, can: (p: string | readonly string[]) => p !== mod.TICKET_EDIT_PROPERTIES && mod.can(p) };
});

const F = () => useFormStore.getState();
const NEW = 'new-ticket:1';

beforeEach(async () => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useFormStore.setState({ forms: {} });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useUi.setState({ toasts: [] });
  useTickets.setState({ loaded: false, tickets: [], counts: {} });
  await useTickets.getState().load();
});

describe('formStore: criação sem permissão de editar propriedades', () => {
  it('não auto-atribui ao criador (evita a recusa do POST inteiro)', async () => {
    useTabs.getState().openTab({ kind: 'new-ticket', refId: '1', title: 'Novo ticket' });
    F().init(NEW, null);
    F().patch(NEW, { subject: 'Assunto', requesterId: 'u1', assigneeGroupId: 'g1' }); // g1: o criador é agente dele
    F().setBody(NEW, '<p>Descrição</p>');
    const r = await F().submit(NEW);
    if (!r.ok) throw new Error(r.error);
    expect(r.ticket.assigneeId).toBeUndefined();
  });
});
