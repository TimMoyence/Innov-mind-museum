import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { router } from 'expo-router';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { useLocation } from '@/features/museum/application/useLocation';
import { museumApi } from '@/features/museum/infrastructure/museumApi';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { getErrorMessage } from '@/shared/lib/errors';
import type { CreateSessionRequestDTO } from '../domain/contracts';

type ConversationIntent = 'default' | 'camera' | 'audio' | 'walk';

/**
 * W3 R12 — auto-pickup threshold. Above 0.8 confidence we auto-set
 * `museumMode=true` + `museumId` on the session WITHOUT user prompt.
 * Below 0.5 (or on error / GPS-denied / detection miss) we fall back to the
 * manual picker per R14.
 */
const AUTO_DETECT_PICKUP_THRESHOLD = 0.8;
const AUTO_DETECT_PICKER_FALLBACK_THRESHOLD = 0.5;

/** Expo Router path of the museum picker screen (T4.3). */
const MUSEUM_PICKER_ROUTE = '/(stack)/museums-picker';

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
  /**
   * W3 R11 — when `true` AND `museumId` is absent AND GPS is granted, the
   * hook calls `museumApi.detectMuseum` before opening the session:
   *   - confidence > 0.8 → auto-set museumMode + museumId.
   *   - confidence ≤ 0.5 OR error OR not granted → navigate to picker (R14).
   *   - confidence ∈ (0.5, 0.8] → navigate to picker so the user can confirm.
   * Defaults to `false` for backward compatibility (existing flows already
   * pass museumId explicitly).
   */
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
  // Used by the W3 auto-detect branch below. Reading on demand inside the
  // callback would force consumers into a perma-mounted location effect, so
  // we subscribe to the hook here. When `autoDetectMuseum` is `false` (the
  // default), the values are simply unused — no GPS request is triggered
  // beyond what other components on screen already do.
  const { latitude, longitude, status: locationStatus } = useLocation();

  const startConversation = useCallback(
    async (options?: StartConversationOptions) => {
      if (guardRef.current) return;
      Keyboard.dismiss();

      const intent = options?.intent ?? 'default';

      guardRef.current = true;
      setIsCreating(true);
      setError(null);

      // W3 R11/R12/R14 — auto-detect step. Runs ONLY when:
      //   (a) caller opted in via `autoDetectMuseum: true`,
      //   (b) no explicit `museumId` was provided,
      //   (c) GPS is granted with fresh/cached coords.
      // On detection miss / error / low confidence, we navigate to the
      // picker BEFORE creating a session (R14) so the user can choose
      // explicitly. The session is created with the picker's selection.
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
            // R12 — silent auto-set.
            resolvedMuseumId = detection.museumId;
            resolvedMuseumName = detection.name ?? undefined;
            resolvedMuseumMode = true;
          } else if (detection.confidence <= AUTO_DETECT_PICKER_FALLBACK_THRESHOLD) {
            // R14 — too uncertain to auto-pick. Hand off to manual picker.
            guardRef.current = false;
            setIsCreating(false);
            router.push(MUSEUM_PICKER_ROUTE);
            return;
          }
          // confidence ∈ (0.5, 0.8] → also hand off to picker so the user
          // can confirm or pick a different museum (R13/R14 hybrid). The
          // confirm-sheet UI variant is owned by the home banner — at
          // session-create time we prefer explicit picking.
          else {
            guardRef.current = false;
            setIsCreating(false);
            router.push(MUSEUM_PICKER_ROUTE);
            return;
          }
        } catch {
          // R14 — detect-museum failed. Fall back to picker. The session
          // is NOT created; user picks then re-initiates.
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
        // R14 — GPS denied / unavailable. Manual picker is the only path.
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
          const { defaultLocale, defaultMuseumMode } = useRuntimeSettingsStore.getState();
          payload.locale = defaultLocale;
          payload.museumMode = resolvedMuseumMode ?? defaultMuseumMode;
          payload.museumId = resolvedMuseumId;
          payload.museumName = resolvedMuseumName;
          payload.coordinates = options?.coordinates;
        }

        // BE Zod enum (`CHAT_SESSION_INTENTS` in museum-backend/src/modules/chat/domain/chat.types.ts)
        // only accepts 'default' | 'walk'. UI-level intents like 'audio' / 'camera' propagate via
        // the URL query string below, NOT via the payload — sending them would yield 400.
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
