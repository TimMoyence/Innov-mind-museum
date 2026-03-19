import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { Text } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { liquidColors } from '@/shared/ui/liquidTheme';

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
  return (
    <GlassCard style={styles.inputRow} intensity={56}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder='Ask about an artwork, monument, or send voice/photo...'
        placeholderTextColor='#64748B'
        multiline
        editable={!disabled}
      />
      <Pressable style={styles.sendButton} onPress={onSend} disabled={isSending || disabled}>
        {isSending ? <ActivityIndicator color='#FFFFFF' /> : <Text style={styles.sendText}>Send</Text>}
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
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: liquidColors.textPrimary,
  },
  sendButton: {
    borderRadius: 12,
    backgroundColor: liquidColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
