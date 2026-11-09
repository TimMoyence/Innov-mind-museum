import * as Sentry from '@sentry/react-native';

import { authService } from '@/features/auth/infrastructure/authApi';
import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';

export type BootstrapOutcome =
  | { outcome: 'hydrated'; durationMs: number }
  | { outcome: 'skipped_already_done' }
  | { outcome: 'failed'; error: string };

let hasBootstrappedThisSession = false;
let inFlight: Promise<BootstrapOutcome> | null = null;

const breadcrumb = (
  message: string,
  level: Sentry.SeverityLevel,
  data?: Record<string, unknown>,
): void => {
  try {
    Sentry.addBreadcrumb({ category: 'auth', message, level, data });
  } catch {}
};

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

export function resetBootstrapProfileGuard(): void {
  hasBootstrappedThisSession = false;
  inFlight = null;
}
