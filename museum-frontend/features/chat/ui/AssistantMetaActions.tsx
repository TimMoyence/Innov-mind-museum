import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

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
              color={feedbackValue === 'positive' ? '#34C759' : theme.timestamp}
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
              color={feedbackValue === 'negative' ? '#FF3B30' : theme.timestamp}
            />
          </Pressable>
        </>
      ) : null}
      {onToggleTts ? (
        <Pressable
          style={styles.actionButton}
          onPress={() => {
            void Haptics.selectionAsync();
            void onToggleTts(messageId);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={ttsPlaying ? t('chat.listening') : t('chat.listen')}
        >
          {ttsLoading ? (
            <ActivityIndicator size="small" color={theme.timestamp} />
          ) : (
            <Ionicons
              name={ttsPlaying ? 'pause-outline' : 'volume-high-outline'}
              size={13}
              color={theme.timestamp}
            />
          )}
          <Text style={[styles.actionLabel, { color: theme.timestamp }]}>
            {ttsPlaying ? t('chat.listening') : t('chat.listen')}
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
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  actionLabel: {
    fontSize: 11,
  },
});
