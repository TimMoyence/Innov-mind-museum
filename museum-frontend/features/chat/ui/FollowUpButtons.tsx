import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface FollowUpButtonsProps {
  questions: string[];
  onPress: (text: string) => void;
  /** When true, all buttons are disabled (e.g. during an active send). */
  disabled?: boolean;
}

/** Renders a vertical list of tappable follow-up question buttons suggested by the assistant. */
export const FollowUpButtons = ({ questions, onPress, disabled = false }: FollowUpButtonsProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  if (!questions.length) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: theme.placeholderText }]}>
        {t('followUpButtons.section_label')}
      </Text>
      {questions.map((question) => (
        <Pressable
          key={question}
          style={[
            styles.button,
            { borderColor: theme.primaryBorderSubtle, backgroundColor: theme.primaryTint },
            disabled && styles.buttonDisabled,
          ]}
          onPress={() => {
            onPress(question);
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={question}
          accessibilityHint={t('a11y.chat.follow_up_hint')}
        >
          <Ionicons name="send-outline" size={14} color={theme.primary} />
          <Text style={[styles.buttonText, { color: theme.primary }]}>{question}</Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: semantic.chat.gapSmall,
    gap: semantic.chat.gapSmall,
    maxWidth: '85%',
    alignSelf: 'flex-end',
  },
  sectionLabel: {
    fontSize: semantic.section.labelSize,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: space['0.5'],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gap,
    borderRadius: semantic.button.radius,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: space['3.5'],
    paddingVertical: space['2.5'],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    flex: 1,
    fontSize: semantic.form.labelSize,
    fontWeight: '500',
  },
});
