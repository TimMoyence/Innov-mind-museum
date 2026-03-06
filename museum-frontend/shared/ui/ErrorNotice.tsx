import type { JSX } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ErrorNoticeProps {
  message: string;
  onDismiss?: () => void;
}

export const ErrorNotice = ({
  message,
  onDismiss,
}: ErrorNoticeProps): JSX.Element => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
      {onDismiss ? (
        <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
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
  dismissButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dismissText: {
    color: '#7F1D1D',
    fontSize: 12,
    fontWeight: '700',
  },
});
