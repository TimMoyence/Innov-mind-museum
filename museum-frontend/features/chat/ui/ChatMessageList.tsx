import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { findLastAssistantMessage } from '@/features/chat/application/chatSessionLogic.pure';
import type { ChatPipelinePhase } from '@/features/chat/application/phases';
import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { useTextToSpeech } from '@/features/chat/application/useTextToSpeech';
import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';
import { MessageActions } from '@/features/chat/ui/MessageActions';
import { StatusIndicator } from '@/features/chat/ui/StatusIndicator';
import { TypingPlaceholder } from '@/features/chat/ui/TypingPlaceholder';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useKeyboardVisible } from '@/shared/ui/hooks/useKeyboardVisible';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface ChatMessageListProps {
  messages: ChatUiMessage[];
  isSending: boolean;
  isStreaming?: boolean;
  locale: string;
  onRecommendationPress: (text: string) => void;
  onCamera: () => void;
  onImageError: (messageId: string) => void;
  onReport: (messageId: string) => void;
  onLinkPress?: (url: string) => boolean;
  onRetry?: (message: ChatUiMessage) => void;
  isAssistantPending?: boolean;
  currentPhase?: ChatPipelinePhase | null;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export const ChatMessageList = ({
  messages,
  isSending,
  isStreaming = false,
  locale,
  onRecommendationPress,
  onCamera,
  onImageError,
  onReport,
  onLinkPress,
  onRetry,
  isAssistantPending = false,
  currentPhase = null,
  onScroll,
}: ChatMessageListProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const keyboardVisible = useKeyboardVisible();
  const listRef = useRef<FlashListRef<ChatUiMessage>>(null);
  const {
    isPlaying: ttsIsPlaying,
    isLoading: ttsIsLoading,
    activeMessageId: ttsActiveId,
    failedMessageId: ttsFailedId,
    skippedLowDataMessageId: ttsSkippedId,
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

  const lastAssistantMessage = useMemo(() => findLastAssistantMessage(messages), [messages]);

  useEffect(() => {
    if (messages.length > 0 || isSending) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isSending]);

  const handleContentSizeChange = useCallback(() => {
    if (isStreaming) {
      listRef.current?.scrollToEnd({ animated: false });
    }
  }, [isStreaming]);

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

  const handleArtworkPress = useCallback((message: ChatUiMessage) => {
    const detected = message.metadata?.detectedArtwork;
    if (!detected?.artworkId) return;
    router.push({
      pathname: '/museum-detail',
      params: {
        name: detected.museum ?? '',
        artworkId: detected.artworkId,
      },
    });
  }, []);

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
            ttsFailed={ttsFailedId === item.id}
            ttsSkippedLowData={ttsSkippedId === item.id}
            onLinkPress={onLinkPress}
            onToggleTts={isAssistant ? ttsToggle : undefined}
            onRetry={onRetry}
            feedbackValue={isAssistant ? (feedbackMap[item.id] ?? null) : undefined}
            onFeedback={isAssistant ? handleFeedback : undefined}
            onArtworkPress={isAssistant ? handleArtworkPress : undefined}
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
      onRecommendationPress,
      onImageError,
      onReport,
      onLinkPress,
      onRetry,
      feedbackMap,
      handleFeedback,
      handleShare,
      handleArtworkPress,
      t,
      theme.textTertiary,
      ttsIsPlaying,
      ttsIsLoading,
      ttsActiveId,
      ttsFailedId,
      ttsSkippedId,
      ttsToggle,
    ],
  );

  const showStatusIndicator = isSending && !isStreaming && currentPhase !== null;

  return (
    <FlashList
      testID="message-list"
      ref={listRef}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      getItemType={getMessageType}
      contentContainerStyle={styles.listContent}
      onContentSizeChange={handleContentSizeChange}
      onScroll={onScroll}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={t('a11y.chat.messages_list')}
      accessibilityRole="list"
      ListEmptyComponent={
        <EmptyState
          variant="chat"
          title={t('empty.chat.title')}
          description={t('empty.chat.description')}
          primaryAction={{
            label: t('empty.chat.actionLabel'),
            onPress: onCamera,
            iconName: 'camera-outline',
          }}
          footnote={t('ai_disclosure.chat_footer')}
          compact={keyboardVisible}
          testID="chat-empty-state"
        />
      }
      ListFooterComponent={
        <>
          <TypingPlaceholder visible={isAssistantPending} testID="chat-assistant-pending" />
          {showStatusIndicator ? <StatusIndicator phase={currentPhase} /> : null}
        </>
      }
      ItemSeparatorComponent={ItemSeparator}
    />
  );
};

const getMessageType = (item: ChatUiMessage): string => item.role;

const ItemSeparator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: semantic.screen.padding,
  },
  separator: {
    height: space['2.5'],
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: space['1'],
    paddingVertical: semantic.badge.paddingY,
    paddingHorizontal: semantic.badge.paddingX,
    marginTop: space['0.5'],
  },
  shareButtonText: {
    fontSize: semantic.section.labelSize,
    fontWeight: '500',
  },
});
