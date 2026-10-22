import type { ComboOption } from '@/components/ui';
import type { Priority, SlaState } from '@/types/domain';

/* Dados fictícios locais da página /kit. Nada aqui vem de (nem alimenta) o app real. */

/* -------------------------------------------------------------------------- */
/* Seções (navegação lateral)                                                  */
/* -------------------------------------------------------------------------- */

export const SECOES = [
  { id: 'tokens', titulo: 'Tokens' },
  { id: 'botoes', titulo: 'Botões' },
  { id: 'campos', titulo: 'Campos' },
  { id: 'status', titulo: 'Status e badges' },
  { id: 'sobreposicoes', titulo: 'Abas, painéis e avisos' },
  { id: 'tabela', titulo: 'Tabela' },
  { id: 'vazios', titulo: 'Estados vazios e erros' },
] as const;

export type SecaoId = (typeof SECOES)[number]['id'];

/* -------------------------------------------------------------------------- */
/* Utilitários de simulação                                                    */
/* -------------------------------------------------------------------------- */

export const esperar = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Atraso de 300 a 700 ms, como a camada `api/` mockada do app. */
export const atrasoSimulado = (): Promise<void> => esperar(300 + Math.round(Math.random() * 400));

/** Minúsculas e sem acentos, para a busca dos exemplos assíncronos. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Pessoas                                                                     */
/* -------------------------------------------------------------------------- */

export const NOMES = [
  'Marina Duarte',
  'Rafael Teixeira',
  'Camila Nogueira',
  'Henrique Salles',
  'Beatriz Carvalho',
  'Lucas Prado',
  'Fernanda Lopes',
  'Gustavo Menezes',
  'Patrícia Andrade',
  'Diego Ferraz',
  'Juliana Barros',
  'Thiago Moreira',
] as const;

function emailDe(nome: string): string {
  return `${normalizar(nome).replace(/\s+/g, '.')}@exemplo.com.br`;
}

export const PESSOAS: ComboOption[] = NOMES.map((nome, indice) => ({
  value: `pessoa-${indice + 1}`,
  label: nome,
  description: emailDe(nome),
}));

/** Busca "na API": 300 a 700 ms, por nome ou e-mail. */
export async function buscarPessoas(consulta: string): Promise<ComboOption[]> {
  await atrasoSimulado();
  const termo = normalizar(consulta.trim());
  if (!termo) return PESSOAS;
  return PESSOAS.filter((p) => normalizar(`${p.label} ${p.description ?? ''}`).includes(termo));
}

export const TAGS_SUGERIDAS = ['vip', 'reembolso', 'urgente', 'cobrança', 'api', 'bug', 'onboarding', 'churn', 'integração'];

/* -------------------------------------------------------------------------- */
/* SLA com tempos fixos (a pílula recebe `now` e não atualiza sozinha)         */
/* -------------------------------------------------------------------------- */

export const SLA_AGORA = new Date('2026-03-10T15:00:00.000Z');

export interface SlaExemplo {
  id: string;
  rotulo: string;
  dueAt: string;
  state: SlaState;
}

export const SLA_EXEMPLOS: SlaExemplo[] = [
  { id: 'ok', rotulo: 'No prazo (verde)', dueAt: '2026-03-10T18:40:00.000Z', state: 'ok' },
  { id: 'ok-curto', rotulo: 'No prazo, 1h 20m', dueAt: '2026-03-10T16:20:00.000Z', state: 'ok' },
  { id: 'warning', rotulo: 'Atenção (âmbar, 60 min ou menos)', dueAt: '2026-03-10T15:49:00.000Z', state: 'warning' },
  { id: 'breached', rotulo: 'Estourado (vermelho)', dueAt: '2026-03-10T14:48:00.000Z', state: 'breached' },
  { id: 'met', rotulo: 'Cumprido', dueAt: '2026-03-10T14:00:00.000Z', state: 'met' },
];

/* -------------------------------------------------------------------------- */
/* Tickets de exemplo (tabela)                                                 */
/* -------------------------------------------------------------------------- */

export interface TicketExemplo {
  id: number;
  assunto: string;
  solicitante: string;
  /** id de `DEFAULT_STATUSES`. */
  statusId: string;
  prioridade?: Priority;
  canal: 'email' | 'web_form';
  sla?: { dueAt: string; state: SlaState };
  atualizadoEm: string;
}

const BASE = Date.now();
const emMinutos = (minutos: number): string => new Date(BASE + minutos * 60_000).toISOString();

export const TICKETS_EXEMPLO: TicketExemplo[] = [
  { id: 1041, assunto: 'Não consigo redefinir minha senha', solicitante: 'Marina Duarte', statusId: 'open', prioridade: 'high', canal: 'email', sla: { dueAt: emMinutos(49), state: 'warning' }, atualizadoEm: emMinutos(-11) },
  { id: 1042, assunto: 'Cobrança duplicada na fatura de março', solicitante: 'Rafael Teixeira', statusId: 'new', prioridade: 'urgent', canal: 'web_form', sla: { dueAt: emMinutos(-12), state: 'breached' }, atualizadoEm: emMinutos(-3) },
  { id: 1043, assunto: 'Dúvida sobre integração com a API', solicitante: 'Camila Nogueira', statusId: 'in_progress', prioridade: 'normal', canal: 'email', sla: { dueAt: emMinutos(220), state: 'ok' }, atualizadoEm: emMinutos(-42) },
  { id: 1044, assunto: 'Pedido de segunda via de nota fiscal', solicitante: 'Henrique Salles', statusId: 'pending', prioridade: 'low', canal: 'email', sla: { dueAt: emMinutos(-180), state: 'met' }, atualizadoEm: emMinutos(-125) },
  { id: 1045, assunto: 'Erro 500 ao exportar relatório', solicitante: 'Beatriz Carvalho', statusId: 'open', prioridade: 'high', canal: 'web_form', sla: { dueAt: emMinutos(80), state: 'ok' }, atualizadoEm: emMinutos(-25) },
  { id: 1046, assunto: 'Como adicionar novos usuários à conta?', solicitante: 'Lucas Prado', statusId: 'solved', prioridade: 'normal', canal: 'email', sla: { dueAt: emMinutos(-1500), state: 'met' }, atualizadoEm: emMinutos(-1440) },
  { id: 1047, assunto: 'Solicitação de cancelamento de plano', solicitante: 'Fernanda Lopes', statusId: 'pending', prioridade: 'normal', canal: 'email', sla: { dueAt: emMinutos(360), state: 'ok' }, atualizadoEm: emMinutos(-240) },
  { id: 1048, assunto: 'Painel não carrega no Safari', solicitante: 'Gustavo Menezes', statusId: 'in_progress', prioridade: 'high', canal: 'web_form', sla: { dueAt: emMinutos(35), state: 'warning' }, atualizadoEm: emMinutos(-8) },
  { id: 1049, assunto: 'Elogio ao atendimento de ontem', solicitante: 'Patrícia Andrade', statusId: 'solved', prioridade: 'low', canal: 'email', atualizadoEm: emMinutos(-2880) },
  { id: 1050, assunto: 'Atualização de dados cadastrais', solicitante: 'Diego Ferraz', statusId: 'new', canal: 'web_form', sla: { dueAt: emMinutos(300), state: 'ok' }, atualizadoEm: emMinutos(-6) },
  { id: 1051, assunto: 'Webhook retornando timeout', solicitante: 'Juliana Barros', statusId: 'open', prioridade: 'urgent', canal: 'email', sla: { dueAt: emMinutos(-65), state: 'breached' }, atualizadoEm: emMinutos(-18) },
  { id: 1052, assunto: 'Quero migrar para o plano anual', solicitante: 'Thiago Moreira', statusId: 'pending', prioridade: 'low', canal: 'email', sla: { dueAt: emMinutos(1560), state: 'ok' }, atualizadoEm: emMinutos(-190) },
];
