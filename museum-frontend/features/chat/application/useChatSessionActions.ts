import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import {
  decideMarkdownLinkAction,
} from '@/features/chat/application/chatSessionLogic.pure';
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

/**
 * Bundles the chat-session screen's user-action callbacks (report, image
 * refresh, markdown link tap, long-press → context menu). The screen
 * file passes UI state in (messages, setBrowserUrl, etc.) and consumes
 * the resulting handlers; testing each handler in isolation no longer
 * requires standing up the entire screen tree.
 */
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
        { text: t('chat.report_offensive'), onPress: () => void submitReport(messageId, 'offensive') },
        { text: t('chat.report_inaccurate'), onPress: () => void submitReport(messageId, 'inaccurate') },
        { text: t('chat.report_inappropriate'), onPress: () => void submitReport(messageId, 'inappropriate') },
        { text: t('chat.report_other'), onPress: () => void submitReport(messageId, 'other') },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    },
    [submitReport, t],
  );

  /**
   * Markdown link tap handler. `@ronradtke/react-native-markdown-display`'s
   * contract: returning `true` lets the library call `Linking.openURL(url)`
   * (system browser); returning `false` suppresses it. To open the link
   * in the in-app browser without also opening Safari/Chrome, we MUST
   * return `false` after handling. The action mapping lives in
   * `decideMarkdownLinkAction` so it can be unit-tested in isolation.
   */
  const onMessageLinkPress = useCallback(
    (url: string): boolean => {
      const action = decideMarkdownLinkAction(url);
      if (action === 'in-app') {
        params.setBrowserUrl(url);
        return false;
      }
      if (action === 'system') return true; // mailto:, tel:, etc.
      return false; // ignore empty URLs
    },
    [params],
  );

  const onMessageImageError = useCallback(
    (messageId: string) => {
      if (imageRefreshInFlightRef.current.has(messageId)) return;
      imageRefreshInFlightRef.current.add(messageId);
      void params.refreshMessageImageUrl(messageId)
        .catch(() => {
          /* resilient */
        })
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
