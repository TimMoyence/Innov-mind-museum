import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { router } from 'expo-router';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { getErrorMessage } from '@/shared/lib/errors';
import type { CreateSessionRequestDTO } from '../domain/contracts';

type ConversationIntent = 'default' | 'camera' | 'audio';

interface StartConversationOptions {
  intent?: ConversationIntent;
  museumMode?: boolean;
  museumId?: number;
  skipSettings?: boolean;
  museumName?: string;
  museumAddress?: string;
  coordinates?: { lat: number; lng: number };
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
    guardRef.current = true;
    setIsCreating(true);
    setError(null);

    try {
      const intent = options?.intent ?? 'default';

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

      const response = await chatApi.createSession(payload);
      const suffix = intent === 'default' ? '' : `?intent=${intent}`;
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
