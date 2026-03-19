import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';
import { MessageActions } from '@/features/chat/ui/MessageActions';
import { TypingIndicator } from '@/features/chat/ui/TypingIndicator';
import { WelcomeCard } from '@/features/chat/ui/WelcomeCard';

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
}: ChatMessageListProps) => {
  const flatListRef = useRef<FlatList<ChatUiMessage>>(null);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  // Auto-scroll when messages change or sending starts
  useEffect(() => {
    if (messages.length > 0 || isSending) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isSending]);

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
          />

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
    [lastAssistantMessage, locale, isSending, isStreaming, onFollowUpPress, onRecommendationPress, onImageError, onReport],
  );

  // Show typing indicator only when sending but NOT streaming (streaming shows inline cursor)
  const showTypingIndicator = isSending && !isStreaming;

  return (
    <FlatList
      ref={flatListRef}
      data={messages}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <WelcomeCard
          museumMode={museumMode}
          onSuggestion={onSuggestion}
          onCamera={onCamera}
          disabled={isSending}
        />
      }
      ListFooterComponent={showTypingIndicator ? <TypingIndicator /> : null}
      renderItem={renderItem}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 16,
    gap: 10,
  },
});
