import { useCallback } from 'react';
import { Alert, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { ChatUiMessage } from './useChatSession';

interface UseMessageActionsOptions {
  onReport: (messageId: string) => void;
}

/** Hook that provides context menu actions for chat messages: copy, share, report. */
export const useMessageActions = ({ onReport }: UseMessageActionsOptions) => {
  const { t } = useTranslation();

  const copyText = useCallback(
    async (message: ChatUiMessage) => {
      if (!message.text) return;
      await Clipboard.setStringAsync(message.text);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('chat.copied_title'), t('chat.copied_body'));
    },
    [t],
  );

  const shareText = useCallback(
    async (message: ChatUiMessage) => {
      if (!message.text) return;
      const footer = t('chat.share_footer');
      const shareBody = `${message.text}\n\n${footer}`;
      await Share.share({ message: shareBody });
    },
    [t],
  );

  const reportMessage = useCallback(
    (messageId: string) => {
      onReport(messageId);
    },
    [onReport],
  );

  return { copyText, shareText, reportMessage };
};
