import * as Sentry from '@sentry/react-native';

import { authService } from '@/features/auth/infrastructure/authApi';
import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';

/**
 * Outcome of a `bootstrapProfile()` call. Never thrown — `bootstrapProfile`
 * is fire-and-forget and always resolves with a typed verdict so the caller
 * can opt-in to observability without try/catch.
 */
export type BootstrapOutcome =
  | { outcome: 'hydrated'; durationMs: number }
  | { outcome: 'skipped_already_done' }
  | { outcome: 'failed'; error: string };

/**
 * Session-scoped idempotence guard. Reset by {@link resetBootstrapProfileGuard}
 * on logout so the next login re-hydrates.
 */
let hasBootstrappedThisSession = false;
let inFlight: Promise<BootstrapOutcome> | null = null;

const breadcrumb = (
  message: string,
  level: Sentry.SeverityLevel,
  data?: Record<string, unknown>,
): void => {
  try {
    Sentry.addBreadcrumb({ category: 'auth', message, level, data });
  } catch {
    /* Sentry may not be initialised in tests */
  }
};

/**
 * Hydrate the 4 local-first preference stores from `GET /auth/me`.
 *
 * TD-2 Option B (2026-05-15) — server-wins-first per session (R3). Called from
 * `AuthContext.loginWithSession` (login) and the session-resume IIFE (cold
 * start with valid refresh token). NOT called on the refresh-token path —
 * that would re-overwrite local writes that happened between login and the
 * next 401-driven refresh.
 *
 * **Contract:** fire-and-forget. Never throws, never blocks the auth UI. On
 * failure (network 5xx, deserialisation error, etc.) the local Zustand
 * defaults stay in effect and a Sentry breadcrumb is emitted at `warning`
 * level. The 4 stores own their own R5 schema tolerance — `mergeFromServer`
 * silently skips fields it cannot type-check.
 *
 * **Idempotence:** the first call per session wins; subsequent calls short
 * circuit. {@link resetBootstrapProfileGuard} must be invoked on logout so
 * the next login re-runs the hydration.
 */
export async function bootstrapProfile(): Promise<BootstrapOutcome> {
  if (hasBootstrappedThisSession) {
    breadcrumb('bootstrap_profile.skipped_already_done', 'debug');
    return { outcome: 'skipped_already_done' };
  }
  if (inFlight) return inFlight;

  const startedAt = Date.now();
  breadcrumb('bootstrap_profile.start', 'info');

  inFlight = (async (): Promise<BootstrapOutcome> => {
    try {
      const response = await authService.me();
      const user = response.user;

      useUserProfileStore.getState().mergeFromServer({
        contentPreferences: user.contentPreferences,
      });
      useRuntimeSettingsStore.getState().mergeFromServer({
        defaultLocale: user.defaultLocale,
        defaultMuseumMode: user.defaultMuseumMode,
        guideLevel: user.guideLevel,
      });
      useDataModePreferenceStore.getState().mergeFromServer({
        preference: user.dataMode,
      });
      useAudioDescriptionStore.getState().mergeFromServer({
        audioDescriptionMode: user.audioDescriptionMode,
      });

      hasBootstrappedThisSession = true;
      const durationMs = Date.now() - startedAt;
      breadcrumb('bootstrap_profile_completed_ms', 'info', { durationMs });
      breadcrumb('bootstrap_profile.done', 'info', { durationMs });
      return { outcome: 'hydrated', durationMs };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      breadcrumb('bootstrap_profile.failed', 'warning', { error });

      console.warn('[bootstrapProfile] failed:', error);
      return { outcome: 'failed', error };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Reset the session-scoped idempotence guard. Called from `AuthContext.logout`
 * so the next login fires a fresh `/auth/me` hydration.
 */
export function resetBootstrapProfileGuard(): void {
  hasBootstrappedThisSession = false;
  inFlight = null;
}
