import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { SkeletonChatBubble } from '@/shared/ui/SkeletonChatBubble';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { ChatMessageList } from './ChatMessageList';

interface ChatSessionSurfaceProps {
  isLoading: boolean;
  messages: ChatUiMessage[];
  isSending: boolean;
  isStreaming: boolean;
  locale: string;
  onFollowUpPress: (text: string) => void;
  onRecommendationPress: (text: string) => void;
  onCamera: () => void;
  onImageError: (messageId: string) => void;
  onReport: (messageId: string) => void;
  onLinkPress: (url: string) => boolean;
  onRetry?: (message: ChatUiMessage) => void;
  isAssistantPending: boolean;
  surfaceStyle: StyleProp<ViewStyle>;
  skeletonStyle: StyleProp<ViewStyle>;
}

/**
 * Renders the chat-session message-list surface inside its `GlassCard`.
 * Falls back to a 3-row `SkeletonChatBubble` block while the session is
 * still loading from the persistent store. Pulled out of `[sessionId].tsx`
 * so the screen file stays focused on state wiring + top-level layout.
 */
export const ChatSessionSurface = ({
  isLoading,
  messages,
  isSending,
  isStreaming,
  locale,
  onFollowUpPress,
  onRecommendationPress,
  onCamera,
  onImageError,
  onReport,
  onLinkPress,
  onRetry,
  isAssistantPending,
  surfaceStyle,
  skeletonStyle,
}: ChatSessionSurfaceProps) => (
  <GlassCard style={surfaceStyle} intensity={42}>
    {isLoading ? (
      <View style={skeletonStyle}>
        <SkeletonChatBubble alignSelf="flex-start" />
        <SkeletonChatBubble alignSelf="flex-end" />
        <SkeletonChatBubble alignSelf="flex-start" />
      </View>
    ) : (
      <ChatMessageList
        messages={messages}
        isSending={isSending}
        isStreaming={isStreaming}
        locale={locale}
        onFollowUpPress={onFollowUpPress}
        onRecommendationPress={onRecommendationPress}
        onCamera={onCamera}
        onImageError={onImageError}
        onReport={onReport}
        onLinkPress={onLinkPress}
        onRetry={onRetry}
        isAssistantPending={isAssistantPending}
      />
    )}
  </GlassCard>
);
