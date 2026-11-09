import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { SkeletonChatBubble } from '@/shared/ui/SkeletonChatBubble';

import type { ChatPipelinePhase } from '@/features/chat/application/phases';
import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { ChatMessageList } from './ChatMessageList';

interface ChatSessionSurfaceProps {
  isLoading: boolean;
  messages: ChatUiMessage[];
  isSending: boolean;
  isStreaming: boolean;
  locale: string;
  onRecommendationPress: (text: string) => void;
  onCamera: () => void;
  onImageError: (messageId: string) => void;
  onReport: (messageId: string) => void;
  onLinkPress: (url: string) => boolean;
  onRetry?: (message: ChatUiMessage) => void;
  isAssistantPending: boolean;
  currentPhase: ChatPipelinePhase | null;
  surfaceStyle: StyleProp<ViewStyle>;
  skeletonStyle: StyleProp<ViewStyle>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export const ChatSessionSurface = ({
  isLoading,
  messages,
  isSending,
  isStreaming,
  locale,
  onRecommendationPress,
  onCamera,
  onImageError,
  onReport,
  onLinkPress,
  onRetry,
  isAssistantPending,
  currentPhase,
  surfaceStyle,
  skeletonStyle,
  onScroll,
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
        onRecommendationPress={onRecommendationPress}
        onCamera={onCamera}
        onImageError={onImageError}
        onReport={onReport}
        onLinkPress={onLinkPress}
        onRetry={onRetry}
        isAssistantPending={isAssistantPending}
        currentPhase={currentPhase}
        onScroll={onScroll}
      />
    )}
  </GlassCard>
);
