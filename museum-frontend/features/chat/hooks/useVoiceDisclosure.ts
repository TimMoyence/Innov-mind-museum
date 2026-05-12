import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { reportError } from '@/shared/observability/errorReporting';

/**
 * Lazy-loaded SecureStore module. On `web` the module is not available — we
 * fall back to in-memory state, which is acceptable for the voice disclosure
 * since web sessions are inherently short-lived (tab close = new session).
 */
interface SecureStoreModule {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
}

const loadSecureStore = (): SecureStoreModule | null => {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load mirrors authTokenStore pattern
    return require('expo-secure-store') as SecureStoreModule;
  } catch {
    return null;
  }
};

const secureStore = loadSecureStore();

/**
 * SecureStore keys must match `[A-Za-z0-9._-]+` on iOS keychain — replace any
 * other character (incl. UUID dashes are fine, but defensive in case sessionId
 * carries `:` or `/`) before persisting.
 */
const buildStorageKey = (sessionId: string): string => {
  const sanitized = sessionId.replace(/[^A-Za-z0-9._-]/g, '_');
  return `musaium.voice.disclosure_acknowledged.${sanitized}`;
};

export interface UseVoiceDisclosureResult {
  /**
   * `true` when the disclosure must be shown to the user before the first
   * voice interaction of this session. Stays `true` until `acknowledge()` is
   * called or another already-acknowledged session is loaded.
   */
  shouldShowDisclosure: boolean;
  /**
   * `true` once the persisted state has been read at least once. Consumers
   * should hold off on rendering the disclosure modal until this is `true`
   * to avoid a one-frame flash on already-acknowledged sessions.
   */
  isResolved: boolean;
  /**
   * `true` when the user has acknowledged the disclosure for this session
   * (either via `acknowledge()` in this render tree or via a previous mount
   * that wrote to SecureStore).
   */
  isAcknowledged: boolean;
  /**
   * Persist the acknowledgement for the current session and dismiss the
   * disclosure. Storage write failures are reported via `reportError` and
   * swallowed — the in-memory flag is still flipped so the user is never
   * blocked from starting the conversation because of a keychain issue.
   */
  acknowledge: () => Promise<void>;
}

/**
 * Hook that drives the EU AI Act Article 50 voice-disclosure gate.
 *
 * Behaviour:
 * - Reads `musaium.voice.disclosure_acknowledged.<sessionId>` from SecureStore
 *   on mount; if the flag is missing or unreadable, the disclosure must be
 *   shown.
 * - Re-shows on every new session — the acknowledgement is **session-scoped
 *   by design** so Article 50 ("at the latest at the time of the first
 *   interaction") is satisfied for every voice conversation, not just once
 *   per app install.
 * - On web (where SecureStore is unavailable) the acknowledgement is purely
 *   in-memory, which still satisfies the compliance gate because closing the
 *   tab opens a new session anyway.
 *
 * @param sessionId Stable identifier for the current chat session. An empty
 *   string is treated as "not ready" — the hook reports `isResolved=false`
 *   until a real id is provided.
 */
interface DisclosureState {
  /** The sessionId for which this state was computed. */
  sessionId: string;
  isResolved: boolean;
  isAcknowledged: boolean;
}

const INITIAL_STATE: DisclosureState = {
  sessionId: '',
  isResolved: false,
  isAcknowledged: false,
};

export const useVoiceDisclosure = (sessionId: string): UseVoiceDisclosureResult => {
  const [state, setState] = useState<DisclosureState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    if (!sessionId) return;

    const key = buildStorageKey(sessionId);

    const finish = (acked: boolean) => {
      if (cancelled) return;
      setState({ sessionId, isResolved: true, isAcknowledged: acked });
    };

    if (!secureStore) {
      // Web / SecureStore-less builds: in-memory only.
      finish(false);
      return () => {
        cancelled = true;
      };
    }

    secureStore
      .getItemAsync(key)
      .then((value) => {
        finish(value === 'true');
      })
      .catch((error: unknown) => {
        reportError(error, {
          component: 'useVoiceDisclosure',
          action: 'read',
          sessionId,
        });
        finish(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // The state belongs to `state.sessionId`. If the caller passes a fresh
  // session before the effect has had a chance to repopulate, surface
  // `isResolved=false` so consumers don't act on stale data.
  const isCurrent = state.sessionId === sessionId && sessionId.length > 0;
  const isResolved = isCurrent && state.isResolved;
  const isAcknowledged = isCurrent && state.isAcknowledged;

  const acknowledge = useCallback(async () => {
    setState((prev) =>
      prev.sessionId === sessionId
        ? { ...prev, isResolved: true, isAcknowledged: true }
        : { sessionId, isResolved: true, isAcknowledged: true },
    );
    if (!sessionId || !secureStore) return;
    try {
      await secureStore.setItemAsync(buildStorageKey(sessionId), 'true');
    } catch (error) {
      reportError(error, {
        component: 'useVoiceDisclosure',
        action: 'write',
        sessionId,
      });
    }
  }, [sessionId]);

  return {
    shouldShowDisclosure: isResolved && !isAcknowledged,
    isResolved,
    isAcknowledged,
    acknowledge,
  };
};
