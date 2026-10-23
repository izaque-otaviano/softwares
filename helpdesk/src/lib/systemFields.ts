import type { TicketField } from '@/types/domain';

/**
 * Campos PADRÃO do front (não são campos personalizados do backend): aparecem em Admin > Campos como "Campo padrão",
 * sem editar, desativar nem apagar. Os "Campos de IA" (resumo, tópico, sentimento, idioma e confianças) são locais:
 * o backend não os tem (ver `src/api/PENDENTE_NO_BACKEND.md`).
 */
const sys = (id: string, title: string, description?: string): TicketField => ({ id, title, type: 'system', system: true, active: true, required: false, description });

export const STANDARD_FIELDS: TicketField[] = [
  { ...sys('subject', 'Assunto'), required: true },
  { ...sys('description', 'Descrição'), required: true },
  { ...sys('requester', 'Solicitante'), required: true },
  sys('assignee', 'Atribuído para'),
  { ...sys('group', 'Grupo'), required: true },
  sys('status', 'Status'),
  sys('priority', 'Prioridade'),
  sys('type', 'Tipo'),
  sys('tags', 'Tags'),
];

/** Campos de IA do painel: continuam locais (somente neste navegador no modo real). */
export const AI_FIELDS: TicketField[] = [
  sys('resumo', 'Resumo', 'Resumo gerado pela triagem de IA.'),
  sys('topico', 'Tópico', 'Classificação de IA.'),
  sys('topico_confianca', 'Confiança do tópico'),
  sys('sentimento', 'Sentimento', 'Classificação de IA.'),
  sys('sentimento_confianca', 'Confiança do sentimento'),
  sys('idioma', 'Idioma', 'Classificação de IA.'),
  sys('idioma_confianca', 'Confiança do idioma'),
];

export const AI_FIELD_IDS: ReadonlySet<string> = new Set(AI_FIELDS.map((f) => f.id));

/** Opções dos campos de IA do painel. */
export const AI_OPTIONS: Record<'topico' | 'sentimento' | 'idioma', string[]> = {
  topico: ['Cobrança', 'Acesso', 'Integração', 'Entrega', 'Dúvida de uso', 'Cancelamento'],
  sentimento: ['Positivo', 'Neutro', 'Negativo'],
  idioma: ['Português', 'Inglês', 'Espanhol'],
};
