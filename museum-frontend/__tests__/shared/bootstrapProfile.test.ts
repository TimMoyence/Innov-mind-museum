/**
 * Tests for `bootstrapProfile()` orchestrator (TD-2 Option B 2026-05-15).
 *
 * Verifies the fire-and-forget contract: never throws, idempotent per session,
 * dispatches to all 4 stores with the extracted server fields, falls back to
 * a typed `'failed'` outcome on `/auth/me` errors. The Sentry import is
 * smoke-mocked to a no-op so breadcrumbs don't leak to a real DSN in tests.
 */
import '@/__tests__/helpers/test-utils';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockMe = jest.fn();

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    me: (...args: unknown[]) => mockMe(...args),
  },
}));

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
}));

import {
  bootstrapProfile,
  resetBootstrapProfileGuard,
} from '@/shared/infrastructure/bootstrapProfile';
import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

const serverUser = {
  id: 42,
  email: 'visitor@test.com',
  role: 'visitor' as const,
  onboardingCompleted: true,
  contentPreferences: ['history', 'artist'],
  ttsVoice: 'alloy' as const,
  defaultLocale: 'fr-FR',
  defaultMuseumMode: false,
  guideLevel: 'expert' as const,
  dataMode: 'low' as const,
  audioDescriptionMode: true,
};

const resetAllStores = (): void => {
  useUserProfileStore.setState({ contentPreferences: [], hasSeenOnboarding: false });
  useRuntimeSettingsStore.setState({
    defaultLocale: 'en-US',
    defaultMuseumMode: true,
    guideLevel: 'beginner',
  });
  useDataModePreferenceStore.setState({ preference: 'auto' });
  useAudioDescriptionStore.setState({ enabled: false, _hydrated: false });
};

let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  resetBootstrapProfileGuard();
  resetAllStores();
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('bootstrapProfile (TD-2)', () => {
  describe('happy path', () => {
    it('fetches /auth/me and dispatches to all 4 stores with extracted fields', async () => {
      mockMe.mockResolvedValueOnce({ user: serverUser });

      const outcome = await bootstrapProfile();

      expect(outcome.outcome).toBe('hydrated');
      expect(mockMe).toHaveBeenCalledTimes(1);
      expect(useUserProfileStore.getState().contentPreferences).toEqual(['history', 'artist']);
      expect(useRuntimeSettingsStore.getState().defaultLocale).toBe('fr-FR');
      expect(useRuntimeSettingsStore.getState().defaultMuseumMode).toBe(false);
      expect(useRuntimeSettingsStore.getState().guideLevel).toBe('expert');
      expect(useDataModePreferenceStore.getState().preference).toBe('low');
      expect(useAudioDescriptionStore.getState().enabled).toBe(true);
    });

    it('exposes durationMs on the hydrated outcome', async () => {
      mockMe.mockResolvedValueOnce({ user: serverUser });
      const outcome = await bootstrapProfile();
      if (outcome.outcome !== 'hydrated') throw new Error('expected hydrated');
      expect(typeof outcome.durationMs).toBe('number');
      expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('idempotence', () => {
    it('a second call within the same session short-circuits with skipped_already_done', async () => {
      mockMe.mockResolvedValueOnce({ user: serverUser });
      await bootstrapProfile();

      const second = await bootstrapProfile();

      expect(second.outcome).toBe('skipped_already_done');
      expect(mockMe).toHaveBeenCalledTimes(1);
    });

    it('after resetBootstrapProfileGuard, a fresh call re-hydrates from /auth/me', async () => {
      mockMe.mockResolvedValueOnce({ user: serverUser });
      await bootstrapProfile();
      expect(mockMe).toHaveBeenCalledTimes(1);

      resetBootstrapProfileGuard();
      mockMe.mockResolvedValueOnce({ user: { ...serverUser, defaultLocale: 'es-ES' } });
      const outcome = await bootstrapProfile();

      expect(outcome.outcome).toBe('hydrated');
      expect(mockMe).toHaveBeenCalledTimes(2);
      expect(useRuntimeSettingsStore.getState().defaultLocale).toBe('es-ES');
    });

    it('concurrent calls coalesce onto a single in-flight promise', async () => {
      mockMe.mockResolvedValueOnce({ user: serverUser });

      const [a, b] = await Promise.all([bootstrapProfile(), bootstrapProfile()]);

      expect(mockMe).toHaveBeenCalledTimes(1);
      expect(a.outcome).toBe('hydrated');
      // The second concurrent call awaits the same in-flight promise so it
      // also resolves with `'hydrated'`, not `'skipped_already_done'`.
      expect(b.outcome).toBe('hydrated');
    });
  });

  describe('failure path', () => {
    it('does not throw when authService.me rejects', async () => {
      mockMe.mockRejectedValueOnce(new Error('network down'));
      await expect(bootstrapProfile()).resolves.toEqual({
        outcome: 'failed',
        error: 'network down',
      });
    });

    it('keeps local store defaults when the fetch fails', async () => {
      mockMe.mockRejectedValueOnce(new Error('boom'));
      await bootstrapProfile();
      expect(useUserProfileStore.getState().contentPreferences).toEqual([]);
      expect(useRuntimeSettingsStore.getState().defaultLocale).toBe('en-US');
      expect(useDataModePreferenceStore.getState().preference).toBe('auto');
      expect(useAudioDescriptionStore.getState().enabled).toBe(false);
    });

    it('releases the idempotence guard on failure so the next call retries', async () => {
      mockMe.mockRejectedValueOnce(new Error('transient'));
      await bootstrapProfile();
      expect(mockMe).toHaveBeenCalledTimes(1);

      mockMe.mockResolvedValueOnce({ user: serverUser });
      const retry = await bootstrapProfile();

      expect(retry.outcome).toBe('hydrated');
      expect(mockMe).toHaveBeenCalledTimes(2);
    });

    it('stringifies non-Error rejections', async () => {
      mockMe.mockRejectedValueOnce('opaque failure');
      const outcome = await bootstrapProfile();
      expect(outcome).toEqual({ outcome: 'failed', error: 'opaque failure' });
    });
  });

  describe('partial payload (R5 schema tolerance)', () => {
    it('skips fields the server omitted', async () => {
      mockMe.mockResolvedValueOnce({
        user: {
          id: 1,
          email: 'visitor@test.com',
          role: 'visitor' as const,
          onboardingCompleted: true,
          // contentPreferences, defaultLocale, defaultMuseumMode, guideLevel,
          // dataMode, audioDescriptionMode all undefined.
        },
      });

      const outcome = await bootstrapProfile();

      expect(outcome.outcome).toBe('hydrated');
      // Stores keep their pre-call values because each mergeFromServer
      // silently no-ops on undefined.
      expect(useUserProfileStore.getState().contentPreferences).toEqual([]);
      expect(useRuntimeSettingsStore.getState().defaultLocale).toBe('en-US');
      expect(useDataModePreferenceStore.getState().preference).toBe('auto');
      expect(useAudioDescriptionStore.getState().enabled).toBe(false);
    });

    it('applies the subset of fields the server provided', async () => {
      mockMe.mockResolvedValueOnce({
        user: {
          id: 1,
          email: 'visitor@test.com',
          role: 'visitor' as const,
          onboardingCompleted: true,
          guideLevel: 'intermediate' as const,
          audioDescriptionMode: true,
        },
      });

      await bootstrapProfile();

      expect(useRuntimeSettingsStore.getState().guideLevel).toBe('intermediate');
      expect(useAudioDescriptionStore.getState().enabled).toBe(true);
      // Untouched fields stay at their defaults.
      expect(useRuntimeSettingsStore.getState().defaultLocale).toBe('en-US');
      expect(useDataModePreferenceStore.getState().preference).toBe('auto');
    });
  });
});
