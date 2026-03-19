import type { JSX } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ErrorNoticeProps {
  message: string;
  onDismiss?: () => void;
  /** When provided, shows a "Retry" button alongside "Dismiss". */
  onRetry?: () => void;
}

/** Displays a dismissible error banner with a red-tinted background, optional dismiss button, and optional retry button. */
export const ErrorNotice = ({
  message,
  onDismiss,
  onRetry,
}: ErrorNoticeProps): JSX.Element => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
      {onDismiss || onRetry ? (
        <View style={styles.actionsRow}>
          {onRetry ? (
            <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
          {onDismiss ? (
            <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
              <Text style={styles.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(254,242,242,0.82)',
    borderColor: 'rgba(248,113,113,0.36)',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  text: {
    color: '#7F1D1D',
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
    color: '#1E40AF',
    fontSize: 12,
    fontWeight: '700',
  },
  dismissButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dismissText: {
    color: '#7F1D1D',
    fontSize: 12,
    fontWeight: '700',
  },
});
