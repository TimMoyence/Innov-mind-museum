import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

interface ChatInputProps {
  /** Current text value. */
  value: string;
  /** Text change handler. */
  onChangeText: (text: string) => void;
  /** Called when the send button is pressed. */
  onSend: () => void;
  /** Whether the send action is in progress. */
  isSending: boolean;
  /** Whether the input and send button should be disabled. */
  disabled?: boolean;
}

/** Renders the chat text input with a send button, wrapped in a glass card. */
export const ChatInput = ({
  value,
  onChangeText,
  onSend,
  isSending,
  disabled = false,
}: ChatInputProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <GlassCard style={styles.inputRow} intensity={56}>
      <TextInput
        style={[
          styles.input,
          {
            borderColor: theme.inputBorder,
            backgroundColor: theme.inputBackground,
            color: theme.textPrimary,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={t('chatInput.placeholder')}
        placeholderTextColor={theme.textSecondary}
        multiline
        editable={!disabled}
        accessibilityLabel={t('a11y.chat.message_input')}
      />
      <Pressable
        style={[styles.sendButton, { backgroundColor: theme.primary }]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSend();
        }}
        disabled={isSending || disabled}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.chat.send')}
        accessibilityHint={t('a11y.chat.send_hint')}
      >
        {isSending ? (
          <ActivityIndicator color={theme.primaryContrast} />
        ) : (
          <Ionicons name="send" size={20} color={theme.primaryContrast} />
        )}
      </Pressable>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
    padding: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    writingDirection: 'auto',
  },
  sendButton: {
    borderRadius: 999,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
