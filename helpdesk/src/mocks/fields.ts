import type { TicketField } from '@/types/domain';

export const fields: TicketField[] = [
  { id: 'subject', title: 'Assunto', type: 'system', system: true, active: true, required: true },
  { id: 'assignee', title: 'Atribuído para', type: 'system', system: true, active: true, required: false },
  { id: 'group', title: 'Grupo', type: 'system', system: true, active: true, required: true },
  { id: 'description', title: 'Descrição', type: 'system', system: true, active: true, required: true },
  { id: 'resumo', title: 'Resumo', type: 'textarea', system: false, active: true, required: false, description: 'Resumo gerado pela triagem de IA.' },
  { id: 'topico', title: 'Tópico', type: 'dropdown', system: false, active: true, required: false, options: ['Cobrança', 'Acesso', 'Integração', 'Entrega', 'Dúvida de uso', 'Cancelamento'] },
  { id: 'topico_confianca', title: 'Confiança do tópico', type: 'number', system: false, active: true, required: false },
  { id: 'sentimento', title: 'Sentimento', type: 'dropdown', system: false, active: true, required: false, options: ['Positivo', 'Neutro', 'Negativo'] },
  { id: 'sentimento_confianca', title: 'Confiança do sentimento', type: 'number', system: false, active: true, required: false },
  { id: 'idioma', title: 'Idioma', type: 'dropdown', system: false, active: true, required: false, options: ['Português', 'Inglês', 'Espanhol'] },
  { id: 'idioma_confianca', title: 'Confiança do idioma', type: 'number', system: false, active: true, required: false },
  { id: 'grupo_canal', title: 'Grupo do canal', type: 'text', system: false, active: false, required: false, description: 'Grupo responsável pelo canal de entrada.' },
];
