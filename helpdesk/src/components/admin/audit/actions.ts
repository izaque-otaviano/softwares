/** Rótulos das ações do log de auditoria (`AuditAction` do backend). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: 'Criação',
  update: 'Alteração',
  delete: 'Exclusão',
  status_change: 'Mudança de status',
  assign: 'Atribuição',
  login: 'Login',
  config_change: 'Configuração',
  export: 'Exportação',
  anonymize: 'Anonimização',
  scan_blocked: 'Anexo bloqueado pelo antivírus',
};

export const AUDIT_ACTION_OPTIONS = [{ value: '', label: 'Todas as ações' }, ...Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => ({ value, label }))];

export const actionLabel = (action: string): string => AUDIT_ACTION_LABEL[action] ?? action;

export const ACCESS_CONTEXT_LABEL: Record<string, string> = {
  detail: 'Tela do ticket',
  export: 'Exportação',
  api: 'API',
  kanban: 'Quadro',
};

export const contextLabel = (c: string): string => ACCESS_CONTEXT_LABEL[c] ?? c;
