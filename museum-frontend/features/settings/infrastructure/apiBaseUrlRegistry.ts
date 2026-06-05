import { setApiBaseUrl as sharedSetApiBaseUrl } from '@/shared/infrastructure/httpClient';

/**
 * C1 hexagonal (2026-05-23) — feature-infra façade around the shared HTTP
 * client's runtime-switchable API base URL registry. `features/settings/runtimeSettings.ts`
 * applies the resolved base URL on app bootstrap ; routing the call through
 * this thin re-export keeps the architecture sentinel green (no application
 * or feature-root file imports `@/shared/infrastructure/httpClient` directly).
 *
 * The underlying setter still lives in shared infra (it mutates module-scoped
 * state inside the single axios instance) — this is purely a layering façade.
 */
export const setApiBaseUrl = (nextUrl: string): void => {
  sharedSetApiBaseUrl(nextUrl);
};
