import type { Group, Macro, Org, Ticket, TicketStatus, User } from '@/types/domain';
import { configureApi } from '../mock/delay';
import { db } from '../mock/db';
import type { Member } from '../mock/members';
import { getRealMeId } from './auth';

/**
 * Camada LOCAL do modo real (híbrido): as ESCRITAS ainda não vão ao backend (etapa 3). Continuam funcionando no
 * navegador delegando ao mock em memória, e este módulo faz duas coisas:
 *  1. `mirror*`: espelha os dados REAIS lidos no "banco" do mock, para as funções de escrita do mock operarem
 *     sobre dados reais (ids reais) em vez dos dados de exemplo;
 *  2. `Layer`: lembra as alterações locais (editado, criado, removido) e as reaplica sobre as próximas leituras
 *     reais, para a tela não "desfazer" sozinha uma edição local no meio da sessão. Nada disso persiste: recarregar
 *     a página descarta tudo, e nada é enviado ao servidor.
 */

// Em modo real as escritas locais não simulam latência nem falha aleatória do protótipo.
configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });

type Id = string | number;

export class Layer<T extends { id: Id }> {
  private edited = new Map<Id, T>();
  private created = new Map<Id, T>();
  private removed = new Set<Id>();

  /** Registra o resultado de uma escrita local (atualização). */
  record(item: T): void {
    this.removed.delete(item.id);
    if (this.created.has(item.id)) this.created.set(item.id, item);
    else this.edited.set(item.id, item);
  }

  /** Registra uma criação local. */
  add(item: T): void {
    this.removed.delete(item.id);
    this.created.set(item.id, item);
  }

  remove(id: Id): void {
    this.edited.delete(id);
    this.created.delete(id);
    this.removed.add(id);
  }

  get(id: Id): T | undefined {
    return this.removed.has(id) ? undefined : (this.edited.get(id) ?? this.created.get(id));
  }

  isRemoved(id: Id): boolean {
    return this.removed.has(id);
  }

  /** Leitura real + alterações locais: editados substituem, removidos saem, criados entram no fim. */
  apply(real: T[]): T[] {
    const out = real.filter((r) => !this.removed.has(r.id)).map((r) => this.edited.get(r.id) ?? r);
    const ids = new Set(out.map((r) => r.id));
    for (const c of this.created.values()) if (!ids.has(c.id) && !this.removed.has(c.id)) out.push(c);
    return out;
  }

  /** Quantidade de alterações locais pendentes (só informativo). */
  get size(): number {
    return this.edited.size + this.created.size + this.removed.size;
  }

  clear(): void {
    this.edited.clear();
    this.created.clear();
    this.removed.clear();
  }
}


export const layers = {
  tickets: new Layer<Ticket & { id: number }>(),
  users: new Layer<User>(),
  orgs: new Layer<Org>(),
  macros: new Layer<Macro>(),
  statuses: new Layer<TicketStatus>(),
  /** Usuários locais já fundidos: id de origem -> destino (reaplicado aos tickets recarregados). */
  mergedUsers: new Map<string, string>(),
  /** Membros (equipe) alterados localmente: criados e suspensos. */
  members: new Layer<Member>(),
  /**
   * Parte da edição de um ticket REAL que o backend não tem (assunto, solicitante, tipo, CC, campos, seguidores
   * arbitrários): vale só neste navegador e é reaplicada por cima de cada leitura do ticket.
   */
  ticketPatches: new Map<number, Partial<Ticket>>(),
  /** Campos de status sem equivalente no backend (nome para o usuário final, descrição), por id. */
  statusExtras: new Map<string, Pick<TicketStatus, 'endUserName' | 'agentDescription'>>(),
  /** Campos de macro sem equivalente (ação de status, nota interna, descrição, disponível para), por id. */
  macroExtras: new Map<string, Partial<Macro>>(),
  /** Campos de usuário sem equivalente (tags, notas, e-mails extras, idioma, fuso), por id. */
  userExtras: new Map<string, Partial<User>>(),
  /** Campos de organização sem equivalente (tags, grupo padrão, acesso dos usuários), por id. */
  orgExtras: new Map<string, Partial<Org>>(),
  /** Ids (usuários/organizações) "apagados": o backend só desativa; somem das listas desta sessão. */
  hiddenUsers: new Set<string>(),
  hiddenOrgs: new Set<string>(),
};

/** Reaplica os campos locais de um ticket real sobre a leitura do servidor. */
export function withLocalTicketFields<T extends Ticket>(t: T): T {
  const extra = layers.ticketPatches.get(t.id);
  if (!extra) return t;
  const { followerIds, ...rest } = extra;
  const serverOthers = followerIds === undefined ? t.followerIds : t.followerIds.filter((id) => id === getRealMeId());
  return { ...t, ...rest, followerIds: followerIds === undefined ? serverOthers : [...new Set([...serverOthers, ...followerIds])] };
}


export function resetLocalLayers(): void {
  layers.tickets.clear();
  layers.users.clear();
  layers.orgs.clear();
  layers.macros.clear();
  layers.statuses.clear();
  layers.members.clear();
  layers.mergedUsers.clear();
  layers.ticketPatches.clear();
  layers.statusExtras.clear();
  layers.macroExtras.clear();
  layers.userExtras.clear();
  layers.orgExtras.clear();
  layers.hiddenUsers.clear();
  layers.hiddenOrgs.clear();
}

/** Coloca (ou troca) a entidade no array do "banco" do mock, que as funções de escrita do mock consultam. */
export function upsertInDb<T extends { id: Id }>(list: T[], item: T): void {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

export const mirror = {
  tickets: (list: Ticket[]) => {
    db.tickets = [...list];
  },
  users: (list: User[]) => {
    db.users = [...list];
  },
  orgs: (list: Org[]) => {
    db.orgs = [...list];
  },
  groups: (list: Group[]) => {
    db.groups = [...list];
  },
  statuses: (list: TicketStatus[]) => {
    db.statuses = [...list];
  },
  macros: (list: Macro[]) => {
    db.macros = [...list];
  },
};
