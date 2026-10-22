import type { Group, Org } from '@/types/domain';
import { ME_ID, minutesAgo } from './clock';

export const groups: Group[] = [
  { id: 'g1', name: 'Suporte N1', agentIds: [ME_ID, 'a2', 'a3'] },
  { id: 'g2', name: 'Suporte N2', agentIds: ['a4', 'a5'] },
];

export const orgs: Org[] = [
  { id: 'o1', createdAt: minutesAgo(400 * 1440), updatedAt: minutesAgo(12 * 1440), name: 'Lojas Horizonte', domains: ['horizonte.com.br'], tags: ['varejo', 'enterprise'], groupId: 'g1', userAccess: 'org_tickets', details: 'Rede de lojas com operação omnichannel.' },
  { id: 'o2', createdAt: minutesAgo(320 * 1440), updatedAt: minutesAgo(30 * 1440), name: 'Clínica Vida Plena', domains: ['vidaplena.med.br'], tags: ['saude'], groupId: 'g1', userAccess: 'own_tickets', notes: 'Atendimento prioritário em horário comercial.' },
  { id: 'o3', createdAt: minutesAgo(210 * 1440), updatedAt: minutesAgo(5 * 1440), name: 'Transportes Rápido Sul', domains: ['rapidosul.com.br'], tags: ['logistica'], groupId: 'g2', userAccess: 'org_tickets' },
  { id: 'o4', createdAt: minutesAgo(90 * 1440), updatedAt: minutesAgo(2 * 1440), name: 'Studio Pixel Criativo', domains: ['studiopixel.com.br', 'pixelcriativo.com'], tags: ['agencia', 'trial'], groupId: 'g2', userAccess: 'own_tickets' },
];
