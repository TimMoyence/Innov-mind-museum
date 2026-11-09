import { useEffect, useMemo, useRef } from 'react';
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

export const useChatSessionIntents = (params: ChatSessionIntentsParams): ChatSessionIntents => {
  const initialIntent = useMemo<'camera' | 'audio' | null>(() => {
    if (params.intent === 'camera' || params.intent === 'audio') return params.intent;
    return null;
  }, [params.intent]);
  const isWalkMode = params.intent === 'walk';
  const initialPrompt = useMemo(() => params.initialPrompt ?? null, [params.initialPrompt]);

  const intentHandledRef = useRef(false);
  const promptHandledRef = useRef(false);

  useEffect(() => {
    if (params.error) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [params.error]);

  useEffect(() => {
    if (intentHandledRef.current || !initialIntent) return;
    intentHandledRef.current = true;
    if (initialIntent === 'camera') {
      void params.onTakePicture();
      return;
    }
    const timer = setTimeout(() => {
      void params.toggleRecording();
    }, 500);
    return () => {
      clearTimeout(timer);
    };
  }, [initialIntent, params]);

  useEffect(() => {
    if (promptHandledRef.current || !initialPrompt || params.isLoading) return;
    promptHandledRef.current = true;
    void params.sendMessage({ text: initialPrompt });
  }, [initialPrompt, params]);

  return { initialIntent, initialPrompt, isWalkMode };
};
