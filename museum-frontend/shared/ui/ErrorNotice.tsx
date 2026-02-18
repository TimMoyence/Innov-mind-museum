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
    backgroundColor: '#FDECEA',
    borderColor: '#F5C2C7',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  text: {
    color: '#611A15',
    fontSize: 14,
  },
  dismissButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dismissText: {
    color: '#611A15',
    fontSize: 12,
    fontWeight: '600',
  },
});
