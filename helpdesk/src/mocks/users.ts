import type { User } from '@/types/domain';
import { ME_ID, minutesAgo } from './clock';

const DAY = 1440;

function endUser(id: string, name: string, email: string, orgId: string, extra: Partial<User> = {}): User {
  return {
    id,
    name,
    email,
    role: 'end_user',
    orgId,
    tags: [],
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    createdAt: minutesAgo(200 * DAY),
    updatedAt: minutesAgo(10 * DAY),
    lastSeenAt: minutesAgo(3 * DAY),
    ...extra,
  };
}

function staff(id: string, name: string, email: string, role: 'agent' | 'admin'): User {
  return {
    id,
    name,
    email,
    role,
    tags: [],
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    createdAt: minutesAgo(600 * DAY),
    updatedAt: minutesAgo(30 * DAY),
    lastSeenAt: minutesAgo(5),
  };
}

export const endUsers: User[] = [
  endUser('u1', 'Carlos Menezes', 'carlos.menezes@horizonte.com.br', 'o1', { tags: ['vip'], details: 'Gerente de operações da loja online.', lastSeenAt: minutesAgo(40) }),
  endUser('u2', 'Fernanda Lopes', 'fernanda.lopes@horizonte.com.br', 'o1', { tags: ['financeiro'] }),
  endUser('u3', 'Ricardo Tavares', 'ricardo.tavares@horizonte.com.br', 'o1'),
  endUser('u4', 'Juliana Castro', 'juliana.castro@vidaplena.med.br', 'o2', { tags: ['vip'], notes: 'Prefere contato por e-mail.' }),
  endUser('u5', 'Paulo Nogueira', 'paulo.nogueira@vidaplena.med.br', 'o2'),
  endUser('u6', 'Beatriz Furtado', 'beatriz.furtado@vidaplena.med.br', 'o2', { tags: ['recepcao'] }),
  endUser('u7', 'Marcelo Dias', 'marcelo.dias@rapidosul.com.br', 'o3', { lastSeenAt: minutesAgo(90) }),
  endUser('u8', 'Patrícia Gomes', 'patricia.gomes@rapidosul.com.br', 'o3'),
  endUser('u9', 'Thiago Barbosa', 'thiago@studiopixel.com.br', 'o4', { tags: ['trial'] }),
  endUser('u10', 'Camila Rezende', 'camila.rezende@studiopixel.com.br', 'o4'),
  endUser('u11', 'Renato Siqueira', 'renato.siqueira@rapidosul.com.br', 'o3', { suspended: false }),
  endUser('u12', 'Larissa Moura', 'larissa.moura@studiopixel.com.br', 'o4', { language: 'en', timezone: 'America/New_York' }),
];

export const agents: User[] = [
  staff(ME_ID, 'Marina Alves', 'marina.alves@resolv.com.br', 'agent'),
  staff('a2', 'Rafael Pinto', 'rafael.pinto@resolv.com.br', 'agent'),
  staff('a3', 'Aline Teixeira', 'aline.teixeira@resolv.com.br', 'agent'),
  staff('a4', 'Bruno Carvalho', 'bruno.carvalho@resolv.com.br', 'agent'),
  staff('a5', 'Débora Freitas', 'debora.freitas@resolv.com.br', 'agent'),
];

export const admins: User[] = [staff('admin1', 'Henrique Souza', 'henrique.souza@resolv.com.br', 'admin')];

export const users: User[] = [...endUsers, ...agents, ...admins];
