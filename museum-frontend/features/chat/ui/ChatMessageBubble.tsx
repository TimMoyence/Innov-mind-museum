import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { ArtworkCard } from '@/features/chat/ui/ArtworkCard';
import { ImageCarousel } from '@/features/chat/ui/ImageCarousel';
import { ImageFullscreenModal } from '@/features/chat/ui/ImageFullscreenModal';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

import { FeedbackSection, ImageSection, StreamingBody, TtsSection } from './bubbleSections';

interface ChatMessageBubbleProps {
  message: ChatUiMessage;
  locale: string;
  isStreaming?: boolean;
  onImageError: (messageId: string) => void;
  onReport: (messageId: string) => void;
  ttsPlaying?: boolean;
  ttsLoading?: boolean;
  ttsFailed?: boolean;
  ttsSkippedLowData?: boolean;
  onLinkPress?: (url: string) => boolean;
  onToggleTts?: (messageId: string) => Promise<void>;
  onRetry?: (message: ChatUiMessage) => void;
  feedbackValue?: 'positive' | 'negative' | null;
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
}

/**
 * Facade that composes the four NL-4.2 bubble sections — StreamingBody, ImageSection,
 * TtsSection, FeedbackSection — around a user/assistant bubble frame. Memoized to
 * skip re-renders when inputs are structurally identical; during streaming, only
 * text + isStreaming trigger a re-render.
 */
export const ChatMessageBubble = React.memo(
  ({
    message,
    locale,
    isStreaming = false,
    onImageError,
    onReport,
    ttsPlaying = false,
    ttsLoading = false,
    ttsFailed = false,
    ttsSkippedLowData = false,
    onLinkPress,
    onToggleTts,
    onRetry,
    feedbackValue,
    onFeedback,
  }: ChatMessageBubbleProps) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const isAssistant = message.role === 'assistant';
    const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);

    const bubbleContent = (
      <>
        {isAssistant ? (
          <View>
            {!isStreaming && message.metadata?.images?.length ? (
              <ImageCarousel
                images={message.metadata.images}
                onImagePress={(index) => {
                  setFullscreenIndex(index);
                }}
              />
            ) : null}
            <StreamingBody
              text={message.text}
              isStreaming={isStreaming}
              onLinkPress={onLinkPress}
            />
          </View>
        ) : (
          <Text style={{ color: theme.primaryContrast }}>{message.text}</Text>
        )}
        {!isStreaming && message.image?.url ? (
          <ImageSection
            messageId={message.id}
            url={message.image.url}
            expiresAt={message.image.expiresAt}
            onImageError={onImageError}
          />
        ) : null}
        {!isStreaming ? (
          <TtsSection
            messageId={message.id}
            createdAt={message.createdAt}
            locale={locale}
            isAssistant={isAssistant}
            ttsPlaying={ttsPlaying}
            ttsLoading={ttsLoading}
            ttsFailed={ttsFailed}
            ttsSkippedLowData={ttsSkippedLowData}
            onToggleTts={onToggleTts}
            onReport={onReport}
            feedbackValue={feedbackValue}
            onFeedback={onFeedback}
          />
        ) : null}
      </>
    );

    return (
      <View>
        {isAssistant ? (
          <Pressable
            onLongPress={() => {
              if (isStreaming) return;
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onReport(message.id);
            }}
            style={[
              styles.bubble,
              // eslint-disable-next-line react-native/no-inline-styles -- dynamic alignment
              {
                backgroundColor: theme.assistantBubble,
                borderColor: theme.assistantBubbleBorder,
                alignSelf: 'flex-start',
              },
            ]}
            accessibilityRole="text"
            accessibilityLabel={t('a11y.chat.assistant_message')}
            accessibilityHint={t('a11y.chat.long_press_hint')}
          >
            {bubbleContent}
          </Pressable>
        ) : (
          <View
            style={[
              styles.bubble,
              // eslint-disable-next-line react-native/no-inline-styles -- dynamic alignment
              {
                backgroundColor: theme.userBubble,
                borderColor: theme.userBubbleBorder,
                alignSelf: 'flex-end',
              },
            ]}
            accessibilityRole="text"
            accessibilityLabel={t('a11y.chat.user_message')}
          >
            {bubbleContent}
          </View>
        )}

        <FeedbackSection
          message={message}
          isAssistant={isAssistant}
          isStreaming={isStreaming}
          onRetry={onRetry}
        />

        {!isStreaming && isAssistant && message.metadata?.detectedArtwork?.title ? (
          <ArtworkCard
            title={message.metadata.detectedArtwork.title}
            artist={message.metadata.detectedArtwork.artist}
            museum={message.metadata.detectedArtwork.museum}
            room={message.metadata.detectedArtwork.room}
            confidence={message.metadata.detectedArtwork.confidence}
          />
        ) : null}

        {fullscreenIndex !== null && message.metadata?.images ? (
          <ImageFullscreenModal
            images={message.metadata.images}
            initialIndex={fullscreenIndex}
            visible
            onClose={() => {
              setFullscreenIndex(null);
            }}
          />
        ) : null}
      </View>
    );
  },
  (prev, next) => {
    // During streaming: only re-render when text changes OR isStreaming flips.
    // Prevents flicker from unrelated prop churn (TTS/feedback) during streaming.
    if (prev.isStreaming || next.isStreaming) {
      return prev.message.text === next.message.text && prev.isStreaming === next.isStreaming;
    }
    return (
      prev.message.id === next.message.id &&
      prev.message.text === next.message.text &&
      prev.message.image?.url === next.message.image?.url &&
      prev.message.sendFailed === next.message.sendFailed &&
      prev.message.cached === next.message.cached &&
      prev.locale === next.locale &&
      prev.ttsPlaying === next.ttsPlaying &&
      prev.ttsLoading === next.ttsLoading &&
      prev.ttsFailed === next.ttsFailed &&
      prev.ttsSkippedLowData === next.ttsSkippedLowData &&
      prev.feedbackValue === next.feedbackValue
    );
  },
);
ChatMessageBubble.displayName = 'ChatMessageBubble';

const styles = StyleSheet.create({
  bubble: {
    borderRadius: semantic.chat.bubbleRadius,
    padding: semantic.chat.bubblePadding,
    maxWidth: '85%',
    borderWidth: semantic.input.borderWidth,
  },
});
