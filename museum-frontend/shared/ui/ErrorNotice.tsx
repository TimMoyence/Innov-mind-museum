import type { JSX } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from './ThemeContext';
import { semantic, fontSize as fontSizeTokens, radius, space } from './tokens';

interface ErrorNoticeProps {
  message: string;
  onDismiss?: () => void;
  /** When provided, shows a "Retry" button alongside "Dismiss". */
  onRetry?: () => void;
}

/** Displays a dismissible error banner with a red-tinted background, optional dismiss button, and optional retry button. */
export const ErrorNotice = ({ message, onDismiss, onRetry }: ErrorNoticeProps): JSX.Element => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.errorBackground, borderColor: theme.errorBackground },
      ]}
    >
      <Text style={[styles.text, { color: theme.error }]}>{message}</Text>
      {onDismiss || onRetry ? (
        <View style={styles.actionsRow}>
          {onRetry ? (
            <TouchableOpacity
              onPress={onRetry}
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel={t('errorNotice.retry')}
            >
              <Text style={[styles.retryText, { color: theme.primary }]}>
                {t('errorNotice.retry')}
              </Text>
            </TouchableOpacity>
          ) : null}
          {onDismiss ? (
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.dismissButton}
              accessibilityRole="button"
              accessibilityLabel={t('errorNotice.dismiss')}
            >
              <Text style={[styles.dismissText, { color: theme.error }]}>
                {t('errorNotice.dismiss')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    borderWidth: semantic.input.borderWidth,
    padding: semantic.card.paddingCompact,
    marginBottom: semantic.card.paddingCompact,
  },
  text: {
    fontSize: fontSizeTokens.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: semantic.card.gap,
    marginTop: space['2'],
  },
  retryButton: {
    paddingHorizontal: space['1'],
    paddingVertical: space['0.5'],
  },
  retryText: {
    fontSize: fontSizeTokens.xs,
    fontWeight: '700',
  },
  dismissButton: {
    paddingHorizontal: space['1'],
    paddingVertical: space['0.5'],
  },
  dismissText: {
    fontSize: fontSizeTokens.xs,
    fontWeight: '700',
  },
});
