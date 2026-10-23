export { API_MODE, IS_REAL } from './mode';
export type { ApiMode } from './mode';
export { ApiError } from './errors';
export { capabilities, isRealCapability, pendingCapabilities, CAPABILITY_KEYS } from './capabilities';
export type { Capability, CapabilityKey } from './capabilities';
export { authApi } from './auth';
export type { SessionUser, LoginOutcome, TwoFactorMethod } from './session';
export * as ticketsApi from './tickets';
export * as usersApi from './users';
export * as orgsApi from './orgs';
export * as macrosApi from './macros';
export * as triggersApi from './triggers';
export * as searchApi from './search';
export * as metaApi from './meta';
export * as fieldsApi from './fields';
export * as formsApi from './forms';
export * as membersApi from './members';

// Só para testes do modo mock (os testes de tela usam `configureApi`/`resetDb`/`db` daqui).
export * from './mock/delay';
export { db, resetDb } from './mock/db';
