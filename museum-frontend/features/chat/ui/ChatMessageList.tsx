import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { useTextToSpeech } from '@/features/chat/application/useTextToSpeech';
import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';
import { MessageActions } from '@/features/chat/ui/MessageActions';
import { TypingIndicator } from '@/features/chat/ui/TypingIndicator';
import { WelcomeCard } from '@/features/chat/ui/WelcomeCard';
import { useTheme } from '@/shared/ui/ThemeContext';

interface ChatMessageListProps {
  /** Array of chat messages to render. */
  messages: ChatUiMessage[];
  /** Whether the assistant is currently generating a response. */
  isSending: boolean;
  /** Whether tokens are currently being streamed from the LLM. */
  isStreaming?: boolean;
  /** Locale string for time formatting. */
  locale: string;
  /** Whether museum mode is active (affects welcome card suggestions). */
  museumMode: boolean;
  /** Called when a follow-up question is pressed. */
  onFollowUpPress: (text: string) => void;
  /** Called when a recommendation chip is pressed. */
  onRecommendationPress: (text: string) => void;
  /** Called when a welcome card suggestion is pressed. */
  onSuggestion: (text: string) => void;
  /** Called when the camera button on the welcome card is pressed. */
  onCamera: () => void;
  /** Called when a message image fails to load. */
  onImageError: (messageId: string) => void;
  /** Called on long-press of an assistant message. */
  onReport: (messageId: string) => void;
  /** Called to retry sending a failed message. */
  onRetry?: (message: ChatUiMessage) => void;
}

/**
 * Renders the scrollable list of chat messages with auto-scroll,
 * welcome card as empty state, and typing indicator as footer.
 */
export const ChatMessageList = ({
  messages,
  isSending,
  isStreaming = false,
  locale,
  museumMode,
  onFollowUpPress,
  onRecommendationPress,
  onSuggestion,
  onCamera,
  onImageError,
  onReport,
  onRetry,
}: ChatMessageListProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const listRef = useRef<FlashListRef<ChatUiMessage>>(null);
  const {
    isPlaying: ttsIsPlaying,
    isLoading: ttsIsLoading,
    activeMessageId: ttsActiveId,
    togglePlayback: ttsToggle,
  } = useTextToSpeech();
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'positive' | 'negative' | null>>(
    {},
  );

  const handleFeedback = useCallback((messageId: string, value: 'positive' | 'negative') => {
    setFeedbackMap((prev) => {
      const current = prev[messageId] ?? null;
      const next = current === value ? null : value;
      chatApi.setMessageFeedback(messageId, value).catch(() => {
        setFeedbackMap((rollback) => ({ ...rollback, [messageId]: current }));
      });
      return { ...prev, [messageId]: next };
    });
  }, []);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  // Auto-scroll when new messages arrive or sending starts
  useEffect(() => {
    if (messages.length > 0 || isSending) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isSending]);

  // Auto-scroll as streaming content grows
  const handleContentSizeChange = useCallback(() => {
    if (isStreaming) {
      listRef.current?.scrollToEnd({ animated: false });
    }
  }, [isStreaming]);

  // Timer-based scroll during streaming (backup for unreliable onContentSizeChange)
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      listRef.current?.scrollToEnd({ animated: false });
    }, 350);
    return () => {
      clearInterval(interval);
    };
  }, [isStreaming]);

  const handleShare = useCallback(
    async (message: ChatUiMessage) => {
      if (!message.text) return;
      const preview = message.text.length > 200 ? message.text.slice(0, 200) + '...' : message.text;
      const footer = t('chat.share_footer');
      await Share.share({ message: `${preview}\n\n${footer}` });
    },
    [t],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatUiMessage }) => {
      const isAssistant = item.role === 'assistant';
      const isLast = lastAssistantMessage?.id === item.id;
      const isItemStreaming = isStreaming && isLast && isAssistant;

      return (
        <View>
          <ChatMessageBubble
            message={item}
            locale={locale}
            isStreaming={isItemStreaming}
            onImageError={onImageError}
            onReport={onReport}
            ttsPlaying={ttsActiveId === item.id ? ttsIsPlaying : false}
            ttsLoading={ttsActiveId === item.id ? ttsIsLoading : false}
            onToggleTts={isAssistant ? ttsToggle : undefined}
            onRetry={onRetry}
            feedbackValue={isAssistant ? (feedbackMap[item.id] ?? null) : undefined}
            onFeedback={isAssistant ? handleFeedback : undefined}
          />

          {isAssistant && !isItemStreaming && item.text ? (
            <Pressable
              style={styles.shareButton}
              onPress={() => void handleShare(item)}
              accessibilityRole="button"
              accessibilityLabel={t('chat.share_response')}
            >
              <Ionicons name="share-outline" size={14} color={theme.textTertiary} />
              <Text style={[styles.shareButtonText, { color: theme.textTertiary }]}>
                {t('chat.share_response')}
              </Text>
            </Pressable>
          ) : null}

          {isAssistant && isLast && !isStreaming ? (
            <MessageActions
              metadata={item.metadata}
              onFollowUpPress={onFollowUpPress}
              onRecommendationPress={onRecommendationPress}
              isSendingDisabled={isSending}
            />
          ) : null}
        </View>
      );
    },
    [
      lastAssistantMessage,
      locale,
      isSending,
      isStreaming,
      onFollowUpPress,
      onRecommendationPress,
      onImageError,
      onReport,
      onRetry,
      feedbackMap,
      handleFeedback,
      handleShare,
      t,
      theme.textTertiary,
      ttsIsPlaying,
      ttsIsLoading,
      ttsActiveId,
      ttsToggle,
    ],
  );

  // Show typing indicator only when sending but NOT streaming (streaming shows inline cursor)
  const showTypingIndicator = isSending && !isStreaming;

  return (
    <FlashList
      ref={listRef}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      onContentSizeChange={handleContentSizeChange}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Chat messages"
      accessibilityRole="list"
      ListEmptyComponent={
        <WelcomeCard
          museumMode={museumMode}
          onSuggestion={onSuggestion}
          onCamera={onCamera}
          disabled={isSending}
        />
      }
      ListFooterComponent={showTypingIndicator ? <TypingIndicator /> : null}
      ItemSeparatorComponent={ItemSeparator}
    />
  );
};

const ItemSeparator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 16,
  },
  separator: {
    height: 10,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  shareButtonText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
