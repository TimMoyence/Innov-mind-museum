import { Pressable, StyleSheet, Text, View } from 'react-native';

import { liquidColors } from '@/shared/ui/liquidTheme';

interface FollowUpButtonsProps {
  questions: string[];
  onPress: (text: string) => void;
}

/** Renders a vertical list of tappable follow-up question buttons suggested by the assistant. */
export const FollowUpButtons = ({ questions, onPress }: FollowUpButtonsProps) => {
  if (!questions.length) return null;

  return (
    <View style={styles.container}>
      {questions.map((question) => (
        <Pressable
          key={question}
          style={styles.button}
          onPress={() => onPress(question)}
        >
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
  button: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(30, 64, 175, 0.25)',
    backgroundColor: 'rgba(30, 64, 175, 0.06)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    fontSize: 13,
    color: liquidColors.primary,
    fontWeight: '500',
  },
});
