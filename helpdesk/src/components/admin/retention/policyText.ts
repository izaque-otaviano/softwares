/** Nomes dos tipos de dado das políticas de retenção (chaves de `results` do backend). Chave desconhecida aparece como veio. */
export const POLICY_LABEL: Record<string, { name: string; what: string }> = {
  ticket_content: { name: 'Conteúdo de tickets', what: 'Assunto, mensagens e anexos de tickets fechados há muito tempo. A linha do ticket, datas e métricas ficam.' },
  chat_content: { name: 'Conteúdo de chats', what: 'Mensagens e anexos de chats encerrados. Datas e métricas ficam.' },
  audit_log: { name: 'Registros de auditoria', what: 'Registros antigos de quem fez o quê.' },
  ticket_access_log: { name: 'Acessos a tickets', what: 'Registros antigos de leitura de tickets restritos.' },
  notification_read: { name: 'Notificações lidas', what: 'Notificações já lidas e antigas.' },
  outbound_email: { name: 'E-mails enviados', what: 'Histórico de e-mails enviados pelo sistema.' },
  report_export_file: { name: 'Arquivos de relatórios', what: 'Arquivos gerados em exportações de relatórios.' },
};

export const policyName = (key: string): string => POLICY_LABEL[key]?.name ?? key;
