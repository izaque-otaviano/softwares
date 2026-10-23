/**
 * Auditoria, retenção e LGPD no backend usam `IsAdmin` (permissão `settings.manage`), embora exista `audit.view`
 * no catálogo de RBAC. Até o backend passar a aceitar `audit.view`, as telas pedem a mesma permissão que a API.
 * No modo mock a checagem é sempre verdadeira (ver `userCan`).
 */
export const AUDIT_ACCESS: readonly string[] = ['settings.manage'];
export const NO_PERMISSION_MESSAGE = 'Você não tem permissão para esta ação.';
