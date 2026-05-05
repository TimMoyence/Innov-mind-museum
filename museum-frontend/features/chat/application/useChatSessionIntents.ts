import { useEffect, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';

interface ChatSessionIntentsParams {
  intent: string | undefined;
  initialPrompt: string | undefined;
  isLoading: boolean;
  error: string | null;
  onTakePicture: () => Promise<void> | void;
  toggleRecording: () => Promise<void> | void;
  sendMessage: (params: { text?: string }) => Promise<unknown>;
}

interface ChatSessionIntents {
  initialIntent: 'camera' | 'audio' | null;
  initialPrompt: string | null;
  isWalkMode: boolean;
}

/**
 * Centralises the screen-launch intents for the chat session route:
 *
 *  - `intent=camera|audio` → auto-trigger the camera or audio recorder
 *    once the screen mounts (camera fires immediately, audio is delayed
 *    500 ms to avoid silent-failure on iOS while the screen is mid-mount);
 *  - `intent=walk` → enable walk-mode UI affordances (banner, suggestion
 *    chips) without triggering camera or audio side-effects;
 *  - `initialPrompt=...` → submit the prompt as the first user message
 *    once loading clears;
 *  - error haptic → fire `Haptics.notificationAsync(Error)` whenever the
 *    `error` value flips truthy.
 *
 * Each intent is guarded by a `useState` flag so the side-effect runs at
 * most once per mount.
 */
export const useChatSessionIntents = (params: ChatSessionIntentsParams): ChatSessionIntents => {
  const initialIntent = useMemo<'camera' | 'audio' | null>(() => {
    if (params.intent === 'camera' || params.intent === 'audio') return params.intent;
    return null;
  }, [params.intent]);
  const isWalkMode = params.intent === 'walk';
  const initialPrompt = useMemo(() => params.initialPrompt ?? null, [params.initialPrompt]);

  const [isIntentHandled, setIsIntentHandled] = useState(false);
  const [isPromptHandled, setIsPromptHandled] = useState(false);

  useEffect(() => {
    if (params.error) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [params.error]);

  useEffect(() => {
    if (isIntentHandled || !initialIntent) return;
    setIsIntentHandled(true);
    if (initialIntent === 'camera') {
      void params.onTakePicture();
      return;
    }
    // Delay audio recording to ensure screen is fully mounted (avoids silent failure on iOS).
    const timer = setTimeout(() => {
      void params.toggleRecording();
    }, 500);
    return () => {
      clearTimeout(timer);
    };
  }, [initialIntent, isIntentHandled, params]);

  useEffect(() => {
    if (isPromptHandled || !initialPrompt || params.isLoading) return;
    setIsPromptHandled(true);
    void params.sendMessage({ text: initialPrompt });
  }, [initialPrompt, isPromptHandled, params]);

  return { initialIntent, initialPrompt, isWalkMode };
};
