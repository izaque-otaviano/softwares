import { beforeEach, describe, expect, it } from 'vitest';
import { apiConfig, configureApi } from './delay';
import { resetDb } from './db';
import * as tickets from './tickets';
import * as search from './search';
import * as users from './users';

beforeEach(() => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
});

describe('api', () => {
  it('em testes não há atraso nem falha por padrão', () => {
    expect(apiConfig.failRate).toBe(0);
  });
  it('lista e busca tickets', async () => {
    expect(await tickets.listTickets()).toHaveLength(30);
    expect((await tickets.getTicket(1)).id).toBe(1);
    await expect(tickets.getTicket(999)).rejects.toThrow();
  });
  it('contadores nunca falham, mesmo com 100% de falha', async () => {
    configureApi({ failRate: 1 });
    const counts = await tickets.getViewCounts();
    expect(counts.unassigned).toBe(6);
    await expect(tickets.listTickets()).rejects.toThrow();
  });
  it('runView e search', async () => {
    expect(await tickets.runView('unassigned')).toHaveLength(6);
    expect((await search.search('rafael')).users).toHaveLength(1);
    expect((await users.listUsers({ role: 'agent' })).length).toBe(5);
  });
  it('recentViewed', async () => {
    search.trackViewed({ kind: 'user', id: 'u1', title: 'Carlos', meta: 'Usuário' });
    expect((await search.recentViewed())[0].id).toBe('u1');
  });
});
