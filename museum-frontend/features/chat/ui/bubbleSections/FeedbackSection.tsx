import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, radius, semantic, space } from '@/shared/ui/tokens';

interface FeedbackSectionProps {
  message: ChatUiMessage;
  isAssistant: boolean;
  isStreaming: boolean;
  onRetry?: (message: ChatUiMessage) => void;
}

/**
 * Below-bubble user feedback: send-failed retry prompt and the "cached response"
 * badge. Rendered outside the bubble frame because both act as callouts that
 * shouldn't inherit bubble padding / max-width.
 */
export const FeedbackSection = memo(function FeedbackSection({
  message,
  isAssistant,
  isStreaming,
  onRetry,
}: FeedbackSectionProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <>
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
    </>
  );
});

const styles = StyleSheet.create({
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
