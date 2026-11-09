import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { reportError } from '@/shared/observability/errorReporting';

interface SecureStoreModule {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
}

const secureStore: SecureStoreModule | null = Platform.OS === 'web' ? null : SecureStore;

const buildStorageKey = (sessionId: string): string => {
  const sanitized = sessionId.replace(/[^A-Za-z0-9._-]/g, '_');
  return `musaium.voice.disclosure_acknowledged.${sanitized}`;
};

export interface UseVoiceDisclosureResult {
  shouldShowDisclosure: boolean;
  isResolved: boolean;
  isAcknowledged: boolean;
  acknowledge: () => Promise<void>;
}

interface DisclosureState {
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
