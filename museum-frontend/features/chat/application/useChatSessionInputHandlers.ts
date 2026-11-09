import { useCallback, useState } from 'react';
import { Keyboard } from 'react-native';
import { router } from 'expo-router';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import type { useChatSession } from './useChatSession';

interface SendArgs {
  text?: string;
  imageUri?: string;
  audioUri?: string;
  audioBlob?: Blob;
}

interface ChatSessionInputHandlersParams {
  sessionId: string;
  isEmpty: boolean;
  navigationCanGoBack: () => boolean;
  selectedImage: string | null;
  recordedAudioUri: string | null;
  recordedAudioBlob: Blob | null;
  clearSelectedImage: () => void;
  clearRecordedAudio: () => void;
  sendMessage: ReturnType<typeof useChatSession>['sendMessage'];
}

interface ChatSessionInputHandlers {
  text: string;
  setText: (value: string) => void;
  isClosing: boolean;
  clearMedia: () => void;
  onSend: (overrideText?: string) => Promise<void>;
  onRecommendationPress: (recommendationText: string) => void;
  onWalkChipSelect: (chipText: string) => void;
  onClose: () => Promise<void>;
}

export const useChatSessionInputHandlers = (
  params: ChatSessionInputHandlersParams,
): ChatSessionInputHandlers => {
  const [text, setText] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  const clearMedia = useCallback(() => {
    params.clearSelectedImage();
    params.clearRecordedAudio();
  }, [params]);

  const onSend = useCallback(
    async (overrideText?: string) => {
      Keyboard.dismiss();
      const nextText = (overrideText ?? text).trim();
      if (!nextText && !params.selectedImage && !params.recordedAudioUri) return;

      const currentText = nextText;
      const currentImage = params.selectedImage;
      const currentAudioUri = params.recordedAudioUri;
      const currentAudioBlob = params.recordedAudioBlob;
      setText('');
      clearMedia();

      const sent = await params.sendMessage({
        text: currentText || undefined,
        imageUri: currentImage ?? undefined,
        audioUri: currentAudioUri ?? undefined,
        audioBlob: currentAudioBlob ?? undefined,
      } satisfies SendArgs);
      if (!sent) {
        setText(currentText);
      }
    },
    [text, params, clearMedia],
  );

  const onRecommendationPress = useCallback((recommendationText: string) => {
    setText(recommendationText);
  }, []);

  const onWalkChipSelect = useCallback(
    (chipText: string) => {
      void params.sendMessage({ text: chipText });
    },
    [params],
  );

  const onClose = useCallback(async () => {
    if (isClosing) return;
    setIsClosing(true);
    try {
      if (params.isEmpty) await chatApi.deleteSessionIfEmpty(params.sessionId);
    } catch {
    } finally {
      setIsClosing(false);
    }
    if (params.navigationCanGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/conversations');
  }, [isClosing, params]);

  return {
    text,
    setText,
    isClosing,
    clearMedia,
    onSend,
    onRecommendationPress,
    onWalkChipSelect,
    onClose,
  };
};
