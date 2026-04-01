import type { JSX } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from './ThemeContext';

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
            <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
              <Text style={[styles.retryText, { color: theme.primary }]}>
                {t('errorNotice.retry')}
              </Text>
            </TouchableOpacity>
          ) : null}
          {onDismiss ? (
            <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
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
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  retryButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dismissButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dismissText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
