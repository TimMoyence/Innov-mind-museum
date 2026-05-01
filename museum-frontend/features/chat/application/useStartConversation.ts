import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { router } from 'expo-router';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { getErrorMessage } from '@/shared/lib/errors';
import type { CreateSessionRequestDTO } from '../domain/contracts';

type ConversationIntent = 'default' | 'camera' | 'audio' | 'walk';

interface StartConversationOptions {
  intent?: ConversationIntent;
  museumMode?: boolean;
  museumId?: number;
  skipSettings?: boolean;
  museumName?: string;
  museumAddress?: string;
  coordinates?: { lat: number; lng: number };
  /** When set, the chat screen auto-sends this prompt once the session is opened. */
  initialPrompt?: string;
}

interface UseStartConversationReturn {
  isCreating: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  startConversation: (options?: StartConversationOptions) => Promise<void>;
}

export const useStartConversation = (): UseStartConversationReturn => {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef(false);

  const startConversation = useCallback(async (options?: StartConversationOptions) => {
    if (guardRef.current) return;
    Keyboard.dismiss();

    const intent = options?.intent ?? 'default';

    guardRef.current = true;
    setIsCreating(true);
    setError(null);

    try {
      const payload: CreateSessionRequestDTO = {};

      if (options?.skipSettings) {
        payload.museumMode = options.museumMode;
        payload.museumId = options.museumId;
        payload.museumName = options.museumName;
        payload.museumAddress = options.museumAddress;
        payload.coordinates = options.coordinates;
      } else {
        const { defaultLocale, defaultMuseumMode } = useRuntimeSettingsStore.getState();
        payload.locale = defaultLocale;
        payload.museumMode = options?.museumMode ?? defaultMuseumMode;
        payload.museumId = options?.museumId;
        payload.coordinates = options?.coordinates;
      }

      if (intent === 'default' || intent === 'walk') {
        payload.intent = intent;
      }

      const response = await chatApi.createSession(payload);
      const query: string[] = [];
      if (intent !== 'default') query.push(`intent=${intent}`);
      if (options?.initialPrompt) {
        query.push(`initialPrompt=${encodeURIComponent(options.initialPrompt)}`);
      }
      const suffix = query.length ? `?${query.join('&')}` : '';
      router.push(`/(stack)/chat/${response.session.id}${suffix}`);
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      guardRef.current = false;
      setIsCreating(false);
    }
  }, []);

  return { isCreating, error, setError, startConversation };
};
