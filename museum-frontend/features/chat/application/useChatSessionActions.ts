import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { decideMarkdownLinkAction } from '@/features/chat/application/chatSessionLogic.pure';
import type { ChatUiMessage } from '@/features/chat/application/useChatSession';

type ReportReason = 'offensive' | 'inaccurate' | 'inappropriate' | 'other';

interface ChatSessionActionsParams {
  messages: ChatUiMessage[];
  refreshMessageImageUrl: (messageId: string) => Promise<unknown>;
  onMessageLongPress: (msg: ChatUiMessage) => void;
  setBrowserUrl: (url: string | null) => void;
}

interface ChatSessionActions {
  onReportMessage: (messageId: string) => void;
  onMessageLinkPress: (url: string) => boolean;
  onMessageImageError: (messageId: string) => void;
  onMessageLongPress: (messageId: string) => void;
}

export const useChatSessionActions = (params: ChatSessionActionsParams): ChatSessionActions => {
  const { t } = useTranslation();
  const imageRefreshInFlightRef = useRef(new Set<string>());

  const submitReport = useCallback(
    async (messageId: string, reason: ReportReason) => {
      try {
        await chatApi.reportMessage({ messageId, reason });
        Alert.alert(t('chat.report_thanks_title'), t('chat.report_thanks_body'));
      } catch {
        Alert.alert(t('common.error'), t('chat.report_error_body'));
      }
    },
    [t],
  );

  const onReportMessage = useCallback(
    (messageId: string) => {
      Alert.alert(t('chat.report_title'), t('chat.report_body'), [
        {
          text: t('chat.report_offensive'),
          onPress: () => void submitReport(messageId, 'offensive'),
        },
        {
          text: t('chat.report_inaccurate'),
          onPress: () => void submitReport(messageId, 'inaccurate'),
        },
        {
          text: t('chat.report_inappropriate'),
          onPress: () => void submitReport(messageId, 'inappropriate'),
        },
        { text: t('chat.report_other'), onPress: () => void submitReport(messageId, 'other') },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    },
    [submitReport, t],
  );

  const onMessageLinkPress = useCallback(
    (url: string): boolean => {
      const action = decideMarkdownLinkAction(url);
      if (action === 'in-app') {
        let host: string;
        try {
          host = new URL(url).hostname;
        } catch {
          return false;
        }
        Alert.alert(t('chat.link_confirm_title'), t('chat.link_confirm_body', { host }), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('chat.link_confirm_open'),
            onPress: () => {
              params.setBrowserUrl(url);
            },
          },
        ]);
        return false;
      }
      if (action === 'system') return true;
      return false;
    },
    [params, t],
  );

  const onMessageImageError = useCallback(
    (messageId: string) => {
      if (imageRefreshInFlightRef.current.has(messageId)) return;
      imageRefreshInFlightRef.current.add(messageId);
      void params
        .refreshMessageImageUrl(messageId)
        .catch(() => undefined)
        .finally(() => {
          imageRefreshInFlightRef.current.delete(messageId);
        });
    },
    [params],
  );

  const onMessageLongPress = useCallback(
    (messageId: string) => {
      const msg = params.messages.find((m) => m.id === messageId);
      if (msg) params.onMessageLongPress(msg);
    },
    [params],
  );

  return { onReportMessage, onMessageLinkPress, onMessageImageError, onMessageLongPress };
};
