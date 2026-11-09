import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { router } from 'expo-router';
import i18n from 'i18next';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { useLocation } from '@/features/museum/application/useLocation';
import { museumApi } from '@/features/museum/infrastructure/museumApi';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { getErrorMessage } from '@/shared/lib/errors';
import type { CreateSessionRequestDTO } from '../domain/contracts';

type ConversationIntent = 'default' | 'camera' | 'audio' | 'walk';

const AUTO_DETECT_PICKUP_THRESHOLD = 0.8;
const AUTO_DETECT_PICKER_FALLBACK_THRESHOLD = 0.5;

const MUSEUM_PICKER_ROUTE = '/(stack)/museums-picker';

interface StartConversationOptions {
  intent?: ConversationIntent;
  museumMode?: boolean;
  museumId?: number;
  skipSettings?: boolean;
  museumName?: string;
  museumAddress?: string;
  coordinates?: { lat: number; lng: number };
  initialPrompt?: string;
  autoDetectMuseum?: boolean;
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
  const { latitude, longitude, status: locationStatus } = useLocation();

  const startConversation = useCallback(
    async (options?: StartConversationOptions) => {
      if (guardRef.current) return;
      Keyboard.dismiss();

      const intent = options?.intent ?? 'default';

      guardRef.current = true;
      setIsCreating(true);
      setError(null);

      let resolvedMuseumId: number | undefined = options?.museumId;
      let resolvedMuseumName: string | undefined = options?.museumName;
      let resolvedMuseumMode: boolean | undefined = options?.museumMode;
      if (
        options?.autoDetectMuseum === true &&
        options.museumId === undefined &&
        locationStatus === 'granted' &&
        latitude !== null &&
        longitude !== null
      ) {
        try {
          const detection = await museumApi.detectMuseum({
            lat: latitude,
            lng: longitude,
          });
          if (
            detection.museumId !== null &&
            detection.museumId > 0 &&
            detection.confidence > AUTO_DETECT_PICKUP_THRESHOLD
          ) {
            resolvedMuseumId = detection.museumId;
            resolvedMuseumName = detection.name ?? undefined;
            resolvedMuseumMode = true;
          } else if (detection.confidence <= AUTO_DETECT_PICKER_FALLBACK_THRESHOLD) {
            guardRef.current = false;
            setIsCreating(false);
            router.push(MUSEUM_PICKER_ROUTE);
            return;
          } else {
            guardRef.current = false;
            setIsCreating(false);
            router.push(MUSEUM_PICKER_ROUTE);
            return;
          }
        } catch {
          guardRef.current = false;
          setIsCreating(false);
          router.push(MUSEUM_PICKER_ROUTE);
          return;
        }
      } else if (
        options?.autoDetectMuseum === true &&
        options.museumId === undefined &&
        locationStatus !== 'granted'
      ) {
        guardRef.current = false;
        setIsCreating(false);
        router.push(MUSEUM_PICKER_ROUTE);
        return;
      }

      try {
        const payload: CreateSessionRequestDTO = {};

        if (options?.skipSettings) {
          payload.museumMode = resolvedMuseumMode;
          payload.museumId = resolvedMuseumId;
          payload.museumName = resolvedMuseumName;
          payload.museumAddress = options.museumAddress;
          payload.coordinates = options.coordinates;
        } else {
          const { defaultMuseumMode } = useRuntimeSettingsStore.getState();
          payload.locale = i18n.language;
          payload.museumMode = resolvedMuseumMode ?? defaultMuseumMode;
          payload.museumId = resolvedMuseumId;
          payload.museumName = resolvedMuseumName;
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
    },
    [latitude, longitude, locationStatus],
  );

  return { isCreating, error, setError, startConversation };
};
