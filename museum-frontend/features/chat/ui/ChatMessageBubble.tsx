/* eslint-disable react-hooks/refs -- Animated.Value refs are stable objects read once at creation; safe RN pattern */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { AssistantMetaActions } from '@/features/chat/ui/AssistantMetaActions';
import { MarkdownBubble } from '@/features/chat/ui/MarkdownBubble';
import { ArtworkCard } from '@/features/chat/ui/ArtworkCard';
import { ImageCarousel } from '@/features/chat/ui/ImageCarousel';
import { ImageFullscreenModal } from '@/features/chat/ui/ImageFullscreenModal';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, radius, fontSize } from '@/shared/ui/tokens.generated';

const PROACTIVE_REFRESH_MS = 5 * 60 * 1000;

/** Returns true if the URL is a local file URI (not a server signed URL). */
const isLocalFileUri = (url: string): boolean => url.startsWith('file://');

interface ChatMessageBubbleProps {
  /** The message to render. */
  message: ChatUiMessage;
  /** Locale string for time formatting (e.g. 'en-US'). */
  locale: string;
  /** Whether this message is currently being streamed from the LLM. */
  isStreaming?: boolean;
  /** Called when an assistant message image fails to load, to trigger URL refresh. */
  onImageError: (messageId: string) => void;
  /** Called on long-press of an assistant message to report it. */
  onReport: (messageId: string) => void;
  /** Whether TTS audio is currently playing for this message. */
  ttsPlaying?: boolean;
  /** Whether TTS audio is currently loading for this message. */
  ttsLoading?: boolean;
  /** Whether TTS failed for this message. */
  ttsFailed?: boolean;
  /** Called when the user taps a markdown link inside the bubble. Return `true` to mark as handled. */
  onLinkPress?: (url: string) => boolean;
  /** Called to toggle TTS playback for this message. */
  onToggleTts?: (messageId: string) => Promise<void>;
  /** Called to retry sending a failed message. */
  onRetry?: (message: ChatUiMessage) => void;
  /** Current feedback value for this message (positive, negative, or null/undefined). */
  feedbackValue?: 'positive' | 'negative' | null;
  /** Called when user taps thumbs up or down. */
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
}

/**
 * Renders a single chat message bubble with user/assistant styling,
 * markdown support, image display, timestamp, artwork card, and report action.
 * Memoized to prevent unnecessary re-renders; always re-renders during streaming.
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

    // Blinking cursor animation for streaming
    const cursorOpacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
      if (!isStreaming) return;
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(cursorOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(cursorOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
      );
      animation.start();
      return () => {
        animation.stop();
      };
    }, [isStreaming, cursorOpacity]);

    // Proactive signed URL refresh: if expiresAt is within 5 minutes, refresh before it expires
    const imageUrl = message.image?.url;
    const imageExpiresAt = message.image?.expiresAt;
    const handleImageError = useCallback(() => {
      onImageError(message.id);
    }, [onImageError, message.id]);

    useEffect(() => {
      if (!imageUrl || !imageExpiresAt) return;
      if (isLocalFileUri(imageUrl)) return;

      const expiresMs = new Date(imageExpiresAt).getTime();
      const remainingMs = expiresMs - Date.now();

      if (remainingMs <= 0) {
        onImageError(message.id);
        return;
      }

      if (remainingMs <= PROACTIVE_REFRESH_MS) {
        onImageError(message.id);
        return;
      }

      const timerId = setTimeout(() => {
        onImageError(message.id);
      }, remainingMs - PROACTIVE_REFRESH_MS);

      return () => {
        clearTimeout(timerId);
      };
    }, [imageUrl, imageExpiresAt, message.id, onImageError]);

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
            <MarkdownBubble text={message.text} onLinkPress={onLinkPress} />
            {isStreaming ? (
              <Animated.Text
                style={[styles.cursor, { color: theme.primary, opacity: cursorOpacity }]}
              >
                {'▍'}
              </Animated.Text>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.userText, { color: theme.primaryContrast }]}>{message.text}</Text>
        )}
        {!isStreaming && message.image?.url ? (
          <Image
            source={{ uri: message.image.url }}
            style={[
              styles.messageImage,
              { borderColor: theme.separator, backgroundColor: theme.surface },
            ]}
            resizeMode="cover"
            onError={handleImageError}
          />
        ) : null}
        {!isStreaming ? (
          <View style={styles.metaRow}>
            <Text style={[styles.timestamp, { color: theme.timestamp }]}>
              {new Date(message.createdAt).toLocaleTimeString(locale || undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            {isAssistant ? (
              <AssistantMetaActions
                messageId={message.id}
                feedbackValue={feedbackValue}
                onFeedback={onFeedback}
                ttsPlaying={ttsPlaying}
                ttsLoading={ttsLoading}
                ttsFailed={ttsFailed}
                onToggleTts={onToggleTts}
                onReport={onReport}
              />
            ) : null}
          </View>
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

        {message.sendFailed && onRetry ? (
          <View style={styles.failedRow}>
            <Text style={[styles.failedText, { color: theme.error }]}>{t('chat.sendFailed')}</Text>
            <Pressable
              style={[styles.retryButton, { borderColor: theme.error }]}
              onPress={() => {
                void Haptics.selectionAsync();
                onRetry(message);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('common.retry')}
            >
              <Ionicons name="refresh-outline" size={14} color={theme.error} />
              <Text style={[styles.retryLabel, { color: theme.error }]}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!isStreaming && isAssistant && message.cached ? (
          <Text style={[styles.cachedBadge, { color: theme.timestamp }]}>
            {t('chat.cachedResponse')}
          </Text>
        ) : null}

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
    // Always re-render during streaming
    if (prev.isStreaming || next.isStreaming) return false;
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
  userText: {},
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: semantic.chat.gapSmall,
  },
  timestamp: {
    fontSize: semantic.section.labelSize,
  },
  messageImage: {
    marginTop: space['2'],
    width: semantic.media.imagePreview,
    height: semantic.media.imagePreview,
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
  },
  cursor: {
    fontSize: fontSize.lg,
    lineHeight: semantic.chat.iconSize,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: semantic.chat.gap,
    marginTop: space['1'],
  },
  failedText: {
    fontSize: semantic.section.labelSize,
    fontWeight: '500',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['1'],
    paddingVertical: semantic.badge.paddingY,
    paddingHorizontal: semantic.badge.paddingX,
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
  },
  retryLabel: {
    fontSize: semantic.section.labelSize,
    fontWeight: '600',
  },
  cachedBadge: {
    fontSize: fontSize['xs-'],
    fontStyle: 'italic',
    marginTop: space['1'],
    alignSelf: 'flex-start',
  },
});
