import type { TicketField, TicketForm } from '@/types/domain';
import { minutesAgo } from './clock';

/** Campos personalizados de exemplo (o que o backend chama de `ticket-fields`; os campos padrão do front ficam em `lib/systemFields.ts`). */
const base: Omit<TicketField, 'order' | 'system' | 'updatedAt'>[] = [
  { id: 'numero_do_contrato', slug: 'numero_do_contrato', title: 'Número do contrato', type: 'text', active: true, required: false, description: 'Identificação do contrato do cliente.', valuesCount: 0 },
  {
    id: 'severidade',
    slug: 'severidade',
    title: 'Severidade',
    type: 'dropdown',
    active: true,
    required: false,
    options: [
      { value: 'baixa', label: 'Baixa' },
      { value: 'media', label: 'Média' },
      { value: 'alta', label: 'Alta' },
      { value: 'critica', label: 'Crítica' },
    ],
    valuesCount: 0,
  },
  { id: 'valor_em_disputa', slug: 'valor_em_disputa', title: 'Valor em disputa', type: 'number', active: true, required: false, valuesCount: 0 },
  { id: 'prazo_acordado', slug: 'prazo_acordado', title: 'Prazo acordado', type: 'date', active: true, required: false, valuesCount: 0 },
  { id: 'cliente_aprovou', slug: 'cliente_aprovou', title: 'Cliente aprovou', type: 'checkbox', active: true, required: false, valuesCount: 0 },
  { id: 'observacoes_internas', slug: 'observacoes_internas', title: 'Observações internas', type: 'textarea', active: true, required: false, description: 'Só a equipe vê.', valuesCount: 0 },
  { id: 'grupo_do_canal', slug: 'grupo_do_canal', title: 'Grupo do canal', type: 'text', active: false, required: false, description: 'Grupo responsável pelo canal de entrada.', valuesCount: 0 },
];

export const fields: TicketField[] = base.map((f, i) => ({ ...f, system: false, order: i, updatedAt: minutesAgo((3 + i * 4) * 1440) }));

const item = (slug: string, title: string, type: TicketField['type'], required = false) => ({ fieldId: slug, slug, title, type: type as Exclude<TicketField['type'], 'system'>, fieldActive: true, required });

/** Formulários de exemplo: o 1 é o padrão (sempre existe um, e só um). */
export const forms: TicketForm[] = [
  {
    id: '1',
    name: 'Formulário padrão',
    description: 'Usado quando o ticket não tem formulário próprio.',
    active: true,
    isDefault: true,
    order: 0,
    ticketCount: 0,
    fields: [item('numero_do_contrato', 'Número do contrato', 'text'), item('observacoes_internas', 'Observações internas', 'textarea')],
  },
  {
    id: '2',
    name: 'Incidentes',
    description: 'Falhas e indisponibilidades: contrato e severidade obrigatórios.',
    active: true,
    isDefault: false,
    order: 1,
    defaultTeamId: 'g2',
    defaultTeamName: 'Suporte N2',
    defaultType: 'incident',
    ticketCount: 0,
    fields: [item('numero_do_contrato', 'Número do contrato', 'text', true), item('severidade', 'Severidade', 'dropdown', true), item('prazo_acordado', 'Prazo acordado', 'date')],
  },
  {
    id: '3',
    name: 'Financeiro',
    description: 'Cobranças e reembolsos.',
    active: true,
    isDefault: false,
    order: 2,
    defaultTeamId: 'g1',
    defaultTeamName: 'Suporte N1',
    ticketCount: 0,
    fields: [item('valor_em_disputa', 'Valor em disputa', 'number'), item('cliente_aprovou', 'Cliente aprovou', 'checkbox')],
  },
];
