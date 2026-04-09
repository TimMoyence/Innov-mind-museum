import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface AssistantMetaActionsProps {
  /** The message ID used for feedback and report callbacks. */
  messageId: string;
  /** Current feedback value for this message. */
  feedbackValue?: 'positive' | 'negative' | null;
  /** Called when user taps thumbs up or down. */
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
  /** Whether TTS audio is currently playing for this message. */
  ttsPlaying: boolean;
  /** Whether TTS audio is currently loading for this message. */
  ttsLoading: boolean;
  /** Whether TTS failed for this message (disables the listen button). */
  ttsFailed?: boolean;
  /** Called to toggle TTS playback for this message. */
  onToggleTts?: (messageId: string) => Promise<void>;
  /** Called to report a message. */
  onReport: (messageId: string) => void;
}

/** Renders the assistant message meta-actions row: thumbs up/down feedback, TTS button, and report button. */
export const AssistantMetaActions = React.memo(function AssistantMetaActions({
  messageId,
  feedbackValue,
  onFeedback,
  ttsPlaying,
  ttsLoading,
  ttsFailed = false,
  onToggleTts,
  onReport,
}: AssistantMetaActionsProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.metaActions}>
      {onFeedback ? (
        <>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              void Haptics.selectionAsync();
              onFeedback(messageId, 'positive');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('chat.thumbsUp')}
          >
            <Ionicons
              name={feedbackValue === 'positive' ? 'thumbs-up' : 'thumbs-up-outline'}
              size={13}
              color={feedbackValue === 'positive' ? semantic.mapMarker.success : theme.timestamp}
            />
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              void Haptics.selectionAsync();
              onFeedback(messageId, 'negative');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('chat.thumbsDown')}
          >
            <Ionicons
              name={feedbackValue === 'negative' ? 'thumbs-down' : 'thumbs-down-outline'}
              size={13}
              color={feedbackValue === 'negative' ? semantic.mapMarker.error : theme.timestamp}
            />
          </Pressable>
        </>
      ) : null}
      {onToggleTts ? (
        <Pressable
          style={[styles.actionButton, ttsFailed && styles.actionDisabled]}
          onPress={() => {
            void Haptics.selectionAsync();
            void onToggleTts(messageId);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            ttsFailed
              ? t('chat.tts_unavailable')
              : ttsPlaying
                ? t('chat.listening')
                : t('chat.listen')
          }
        >
          {ttsLoading ? (
            <ActivityIndicator size="small" color={theme.timestamp} />
          ) : (
            <Ionicons
              name={
                ttsFailed
                  ? 'volume-mute-outline'
                  : ttsPlaying
                    ? 'pause-outline'
                    : 'volume-high-outline'
              }
              size={13}
              color={ttsFailed ? theme.error : theme.timestamp}
            />
          )}
          <Text style={[styles.actionLabel, { color: ttsFailed ? theme.error : theme.timestamp }]}>
            {ttsFailed
              ? t('chat.tts_unavailable')
              : ttsPlaying
                ? t('chat.listening')
                : t('chat.listen')}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        style={styles.actionButton}
        onPress={() => {
          void Haptics.selectionAsync();
          onReport(messageId);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('messageMenu.report')}
      >
        <Ionicons name="flag-outline" size={13} color={theme.timestamp} />
        <Text style={[styles.actionLabel, { color: theme.timestamp }]}>
          {t('messageMenu.report')}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  metaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2.5'],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    fontSize: semantic.section.labelSize,
  },
});
