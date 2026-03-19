import { useCallback } from 'react';
import { Alert, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import type { ChatUiMessage } from './useChatSession';

interface UseMessageActionsOptions {
  onReport: (messageId: string) => void;
}

/** Hook that provides context menu actions for chat messages: copy, share, report. */
export const useMessageActions = ({ onReport }: UseMessageActionsOptions) => {
  const copyText = useCallback(async (message: ChatUiMessage) => {
    if (!message.text) return;
    await Clipboard.setStringAsync(message.text);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Message copied to clipboard.');
  }, []);

  const shareText = useCallback(async (message: ChatUiMessage) => {
    if (!message.text) return;
    await Share.share({ message: message.text });
  }, []);

  const reportMessage = useCallback(
    (messageId: string) => {
      onReport(messageId);
    },
    [onReport],
  );

  return { copyText, shareText, reportMessage };
};
