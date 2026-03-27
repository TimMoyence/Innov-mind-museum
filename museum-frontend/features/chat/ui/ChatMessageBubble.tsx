/* eslint-disable react-hooks/refs, react/display-name -- React.memo ref pattern + RN Animated */
import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { MarkdownBubble } from '@/features/chat/ui/MarkdownBubble';
import { ArtworkCard } from '@/features/chat/ui/ArtworkCard';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

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
}

/**
 * Renders a single chat message bubble with user/assistant styling,
 * markdown support, image display, timestamp, artwork card, and report action.
 * Memoized to prevent unnecessary re-renders; always re-renders during streaming.
 */
export const ChatMessageBubble = React.memo(
  ({ message, locale, isStreaming = false, onImageError, onReport }: ChatMessageBubbleProps) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const isAssistant = message.role === 'assistant';

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

    const bubbleContent = (
      <>
        {isAssistant ? (
          <View>
            <MarkdownBubble text={message.text} />
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
            onError={() => {
              onImageError(message.id);
            }}
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
              <Pressable
                style={styles.reportButton}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onReport(message.id);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('messageMenu.report')}
              >
                <Ionicons name="flag-outline" size={13} color={theme.timestamp} />
                <Text style={[styles.reportLabel, { color: theme.timestamp }]}>
                  {t('messageMenu.report')}
                </Text>
              </Pressable>
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

        {!isStreaming && isAssistant && message.metadata?.detectedArtwork?.title ? (
          <ArtworkCard
            title={message.metadata.detectedArtwork.title}
            artist={message.metadata.detectedArtwork.artist}
            museum={message.metadata.detectedArtwork.museum}
            room={message.metadata.detectedArtwork.room}
            confidence={message.metadata.detectedArtwork.confidence}
          />
        ) : null}
      </View>
    );
  },
  (prev, next) => {
    // Always re-render during streaming
    if (prev.isStreaming || next.isStreaming) return false;
    return prev.message.id === next.message.id && prev.message.text === next.message.text;
  },
);

const styles = StyleSheet.create({
  bubble: {
    borderRadius: 16,
    padding: 12,
    maxWidth: '85%',
    borderWidth: 1,
  },
  userText: {},
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timestamp: {
    fontSize: 11,
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  reportLabel: {
    fontSize: 11,
  },
  messageImage: {
    marginTop: 8,
    width: 220,
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
  },
  cursor: {
    fontSize: 18,
    lineHeight: 22,
  },
});
