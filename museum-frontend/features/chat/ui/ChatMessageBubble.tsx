import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { ArtworkCard } from '@/features/chat/ui/ArtworkCard';
import { ImageCarousel } from '@/features/chat/ui/ImageCarousel';
import { ImageCarouselSkeleton } from '@/features/chat/ui/ImageCarouselSkeleton';
import { compareMatchCredit } from '@/features/chat/ui/ImageCompareCard';
import { ImageCompareCarousel } from '@/features/chat/ui/ImageCompareCarousel';
import { ImageFullscreenModal } from '@/features/chat/ui/ImageFullscreenModal';
import type { FullscreenImage } from '@/features/chat/ui/ImageFullscreenModal';
import { SourceCitation } from '@/features/chat/ui/SourceCitation';
import type { components } from '@/shared/api/generated/openapi';
import { forceOpaque } from '@/shared/ui/colorUtils';
import { useReducedTransparency } from '@/shared/ui/hooks/useReducedTransparency';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

import { FeedbackSection, ImageSection, StreamingBody, TtsSection } from './bubbleSections';

export const ASSISTANT_BUBBLE_BLUR_INTENSITY = 42;

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
  onArtworkPress?: (message: ChatUiMessage) => void;
}

type CompareMatch = components['schemas']['CompareMatch'];

interface FullscreenView {
  images: readonly FullscreenImage[];
  index: number;
}

const compareMatchImage = (match: CompareMatch): FullscreenImage => ({
  url: match.imageUrl,
  caption: compareMatchCredit(match),
  attribution: match.attribution,
});

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
    onArtworkPress,
  }: ChatMessageBubbleProps) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const reduceTransparency = useReducedTransparency();
    const isAssistant = message.role === 'assistant';
    const [fullscreen, setFullscreen] = useState<FullscreenView | null>(null);

    const hasImages = (message.metadata?.images?.length ?? 0) > 0;
    const showSkeleton = isStreaming && !hasImages;
    const sources = message.metadata?.sources;
    const hasSources = (sources?.length ?? 0) > 0;

    const bubbleContent = (
      <>
        {isAssistant ? (
          <View style={styles.assistantBody}>
            {showSkeleton ? <ImageCarouselSkeleton /> : null}
            {!isStreaming && hasImages && message.metadata?.images ? (
              <ImageCarousel
                images={message.metadata.images}
                onImagePress={(index) => {
                  setFullscreen({ images: message.metadata?.images ?? [], index });
                }}
              />
            ) : null}
            <StreamingBody
              text={message.text}
              isStreaming={isStreaming}
              onLinkPress={onLinkPress}
            />
            {!isStreaming && hasSources && sources ? (
              <View style={styles.sourcesRow}>
                {sources.map((s, i) => (
                  <SourceCitation key={`${s.url}-${String(i)}`} source={s} index={i + 1} />
                ))}
              </View>
            ) : null}
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
            accessibilityHint={t('a11y.chat.long_press_hint')}
          >
            {reduceTransparency ? (
              <View
                testID="chat-bubble-assistant"
                style={[
                  styles.bubble,
                  styles.bubbleAssistantOpaque,
                  {
                    backgroundColor: forceOpaque(theme.assistantBubble),
                    borderColor: theme.assistantBubbleBorder,
                  },
                ]}
              >
                {bubbleContent}
              </View>
            ) : (
              <BlurView
                testID="chat-bubble-assistant"
                intensity={ASSISTANT_BUBBLE_BLUR_INTENSITY}
                tint={theme.blurTint}
                style={[
                  styles.bubble,
                  styles.bubbleAssistantBlur,
                  {
                    backgroundColor: theme.assistantBubble,
                    borderColor: theme.assistantBubbleBorder,
                  },
                ]}
              >
                {bubbleContent}
              </BlurView>
            )}
          </Pressable>
        ) : (
          <View
            testID="chat-bubble-user"
            style={[
              styles.bubble,
              styles.bubbleUser,
              {
                backgroundColor: forceOpaque(theme.userBubble),
                borderColor: theme.userBubbleBorder,
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
            artworkId={message.metadata.detectedArtwork.artworkId}
            onPress={
              onArtworkPress
                ? () => {
                    onArtworkPress(message);
                  }
                : undefined
            }
          />
        ) : null}

        {!isStreaming && isAssistant && message.metadata?.compareResults ? (
          <ImageCompareCarousel
            matches={message.metadata.compareResults.matches}
            onMatchPress={(qid) => {
              const matches = message.metadata?.compareResults?.matches ?? [];
              const index = matches.findIndex((match) => match.qid === qid);
              if (index >= 0) setFullscreen({ images: matches.map(compareMatchImage), index });
            }}
          />
        ) : null}

        {fullscreen ? (
          <ImageFullscreenModal
            images={fullscreen.images}
            initialIndex={fullscreen.index}
            visible
            onClose={() => {
              setFullscreen(null);
            }}
          />
        ) : null}
      </View>
    );
  },
  (prev, next) => {
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
    gap: semantic.chat.gap,
  },
  assistantBody: {
    gap: semantic.chat.gapSmall,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
  },
  bubbleAssistantOpaque: {
    alignSelf: 'flex-start',
  },
  bubbleAssistantBlur: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  sourcesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: semantic.chat.gapSmall,
  },
});
