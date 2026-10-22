import type { Org } from '@/types/domain';
import { ApiError } from '../errors';
import * as mock from '../mock/orgs';
import { db } from '../mock/db';
import { http } from './http';
import { layers, mirror, upsertInDb } from './local';
import { mapCompany, slugify, type CompanyDto, type PlanDto } from './mappers';
import { getCompanyDtos, getOrgs, listAll } from './refs';

/**
 * ORGANIZAÇÕES = empresas (`/settings/companies/`; leitura interna, escrita só administrador). Nome, domínios,
 * razão social e observações vão ao backend; tags, grupo padrão e "acesso dos usuários" não existem lá e ficam neste
 * navegador. "Apagar" desativa a empresa (o backend nunca apaga) e ela some das listas. Fundir segue local.
 */
const withExtras = (o: Org): Org => ({ ...o, ...layers.orgExtras.get(o.id) });
const visible = (list: Org[]): Org[] => list.filter((o) => !layers.hiddenOrgs.has(o.id)).map(withExtras);

export async function listOrgs(): Promise<Org[]> {
  const merged = layers.orgs.apply(visible(await getOrgs()));
  mirror.orgs(merged);
  return merged;
}

export async function getOrg(id: string): Promise<Org> {
  const local = layers.orgs.get(id);
  if (local) return local;
  if (layers.orgs.isRemoved(id) || layers.hiddenOrgs.has(id)) throw new ApiError('Organização não encontrada.', { status: 404 });
  const known = (await getOrgs().catch(() => [])).find((o) => o.id === id);
  if (known) return withExtras(known);
  return withExtras(mapCompany(await http.get<CompanyDto>(`/settings/companies/${encodeURIComponent(id)}/`)));
}

/** Planos ativos (a empresa exige um ao ser criada). */
export async function listPlans(): Promise<mock.PlanOption[]> {
  const plans = await listAll<PlanDto>('/settings/plans/');
  return plans.filter((p) => p.is_active).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0)).map((p) => ({ id: String(p.id), name: p.name }));
}

const serverFields = (patch: Partial<Omit<Org, 'id'>>): Record<string, unknown> => ({
  ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
  ...(patch.domains !== undefined ? { domains: patch.domains } : {}),
  ...(patch.details !== undefined ? { legal_name: patch.details } : {}),
  ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
});

const extrasOf = (o: Partial<Org>): Partial<Org> => ({ tags: o.tags, groupId: o.groupId, userAccess: o.userAccess });

export async function updateOrg(id: string, patch: Partial<Omit<Org, 'id'>>): Promise<Org> {
  const body = serverFields(patch);
  const dto = Object.keys(body).length > 0 ? await http.patch<CompanyDto>(`/settings/companies/${id}/`, body) : await http.get<CompanyDto>(`/settings/companies/${id}/`);
  getCompanyDtos.reset();
  getOrgs.reset();
  const extras = { ...layers.orgExtras.get(id), ...Object.fromEntries(Object.entries(extrasOf(patch)).filter(([, v]) => v !== undefined)) };
  if ('groupId' in patch && patch.groupId === undefined) delete (extras as Partial<Org>).groupId;
  layers.orgExtras.set(id, extras);
  return withExtras(mapCompany(dto));
}

/** Cria a empresa: o backend exige `slug` (derivado do nome, com sufixo se já existir) e `plan`. */
export async function createOrg(input: Parameters<typeof mock.createOrg>[0]): Promise<Org> {
  let plan = input.planId ? Number(input.planId) : undefined;
  if (plan === undefined) plan = Number((await listPlans())[0]?.id);
  if (!plan) throw new ApiError('Escolha o plano da organização (o backend exige um).');
  const base = slugify(input.name) || 'empresa';
  let dto: CompanyDto | undefined;
  for (let i = 0; i < 4 && !dto; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      dto = await http.post<CompanyDto>('/settings/companies/', { name: input.name.trim(), slug, plan, domains: input.domains ?? [], notes: input.notes ?? '', legal_name: input.details ?? '' });
    } catch (e) {
      const slugTaken = e instanceof ApiError && Boolean(e.fieldErrors?.slug) && !e.fieldErrors?.name;
      if (!slugTaken || i === 3) throw e;
    }
  }
  getCompanyDtos.reset();
  getOrgs.reset();
  const org = mapCompany(dto!);
  layers.orgExtras.set(org.id, extrasOf(input));
  return withExtras(org);
}

/** "Apagar" = desativar no backend; some das listas (e dos vínculos) enquanto a empresa estiver inativa. */
export async function deleteOrg(id: string): Promise<void> {
  await http.delete(`/settings/companies/${id}/`);
  getCompanyDtos.reset();
  getOrgs.reset();
  layers.hiddenOrgs.add(id);
}

/** Fusão NÃO existe no backend: segue local (capabilities.merge = 'local'). */
export async function mergeOrgs(sourceId: string, targetId: string): Promise<Org> {
  upsertInDb(db.orgs, await getOrg(sourceId));
  upsertInDb(db.orgs, await getOrg(targetId));
  const saved = await mock.mergeOrgs(sourceId, targetId);
  layers.orgs.remove(sourceId);
  layers.orgs.record(saved);
  return saved;
}
