import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { Text } from 'react-native';
import * as Haptics from 'expo-haptics';
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
      />
      <Pressable
        style={[styles.sendButton, { backgroundColor: theme.primary }]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSend();
        }}
        disabled={isSending || disabled}
      >
        {isSending ? (
          <ActivityIndicator color='#FFFFFF' />
        ) : (
          <Text style={styles.sendText}>{t('chatInput.send')}</Text>
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
  },
  sendButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
