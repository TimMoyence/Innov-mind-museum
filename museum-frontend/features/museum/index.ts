/**
 * Museum feature public API.
 *
 * Cross-feature consumers (settings, chat, anything outside `features/museum/`)
 * MUST import through this barrel. Reaching directly into `application/` or
 * `infrastructure/` from another feature is the cross-feature smell flagged
 * by the 2026-04-30 audit and prevents future refactors of the museum
 * internal layout.
 */
export { useOfflinePacks } from './application/useOfflinePacks';
export { CITY_CATALOG } from './infrastructure/cityCatalog';
export type { City } from './infrastructure/cityCatalog';
