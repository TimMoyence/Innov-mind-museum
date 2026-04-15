import { useCallback, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { userProfileApi } from '@/features/settings/infrastructure/userProfileApi';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';
import { getErrorMessage } from '@/shared/lib/errors';
import type { ContentPreference } from '@/shared/types/content-preference';

/**
 * Application hook for reading and updating the visitor's content preferences.
 *
 * Optimistic update strategy: the Zustand store is updated immediately for
 * instant UI feedback, the PATCH is fired in the background, and on failure
 * the previous value is restored and the error is surfaced.
 *
 * Concurrency: rapid toggles are serialized via a ref-based mutex so that an
 * earlier rollback cannot invalidate a later successful request.
 */
export const useContentPreferences = () => {
  const preferences = useUserProfileStore((s) => s.contentPreferences);
  const setContentPreferences = useUserProfileStore((s) => s.setContentPreferences);
  const toggleContentPreference = useUserProfileStore((s) => s.toggleContentPreference);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const toggle = useCallback(
    async (preference: ContentPreference) => {
      // Simple mutex: refuse concurrent toggles while one PATCH is in flight.
      if (inflightRef.current) return;
      inflightRef.current = true;

      const previous = useUserProfileStore.getState().contentPreferences;
      const next = toggleContentPreference(preference);

      setIsSaving(true);
      setError(null);
      try {
        const persisted = await userProfileApi.updateContentPreferences(next);
        // Align local cache with the server's canonical order.
        setContentPreferences(persisted);
      } catch (err) {
        // Roll back optimistic update.
        setContentPreferences(previous);
        setError(getErrorMessage(err));
        Sentry.captureException(err, { tags: { flow: 'contentPreferences.toggle' } });
      } finally {
        setIsSaving(false);
        inflightRef.current = false;
      }
    },
    [setContentPreferences, toggleContentPreference],
  );

  return {
    preferences,
    isSaving,
    error,
    clearError: () => {
      setError(null);
    },
    toggle,
    isSelected: (p: ContentPreference) => preferences.includes(p),
  };
};
