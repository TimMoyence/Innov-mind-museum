import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { liquidColors } from '@/shared/ui/liquidTheme';

interface FollowUpButtonsProps {
  questions: string[];
  onPress: (text: string) => void;
  /** When true, all buttons are disabled (e.g. during an active send). */
  disabled?: boolean;
}

/** Renders a vertical list of tappable follow-up question buttons suggested by the assistant. */
export const FollowUpButtons = ({ questions, onPress, disabled = false }: FollowUpButtonsProps) => {
  if (!questions.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Quick questions</Text>
      {questions.map((question) => (
        <Pressable
          key={question}
          style={[styles.button, disabled && styles.buttonDisabled]}
          onPress={() => onPress(question)}
          disabled={disabled}
        >
          <Ionicons name='send-outline' size={14} color={liquidColors.primary} />
          <Text style={styles.buttonText}>{question}</Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    gap: 6,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(30, 64, 175, 0.25)',
    backgroundColor: 'rgba(30, 64, 175, 0.06)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    flex: 1,
    fontSize: 13,
    color: liquidColors.primary,
    fontWeight: '500',
  },
});
