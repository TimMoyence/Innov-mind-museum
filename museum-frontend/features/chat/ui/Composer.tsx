import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ChatInput } from '@/features/chat/ui/ChatInput';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, radius, space } from '@/shared/ui/tokens';

interface ComposerProps {
  readonly text: string;
  readonly onChangeText: (text: string) => void;
  readonly onSend: () => void;
  readonly isSending: boolean;
  readonly disabled?: boolean;
  readonly imageUri?: string | null;
  readonly onClearImage?: () => void;
  readonly recordedAudioUri: string | null;
  readonly isRecording: boolean;
  readonly toggleRecording: () => Promise<void> | void;
  readonly onOpenAttachments: () => void;
}

export const Composer = React.memo(function Composer({
  text,
  onChangeText,
  onSend,
  isSending,
  disabled = false,
  imageUri,
  onClearImage,
  recordedAudioUri,
  isRecording,
  toggleRecording,
  onOpenAttachments,
}: ComposerProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const hasAudio = recordedAudioUri !== null;

  return (
    <View style={styles.row}>
      <View style={styles.leadingColumn}>
        <Pressable
          testID="composer-mic-button"
          onPress={() => void toggleRecording()}
          accessibilityRole="button"
          accessibilityLabel={
            isRecording ? t('chat.composer.a11y.mic_recording') : t('chat.composer.a11y.mic')
          }
          accessibilityState={{ busy: isRecording }}
          style={[
            styles.iconButton,
            {
              backgroundColor: isRecording ? theme.error : theme.surface,
              borderColor: theme.cardBorder,
            },
          ]}
          hitSlop={6}
        >
          <Ionicons
            name={isRecording ? 'stop-circle-outline' : 'mic-outline'}
            size={22}
            color={isRecording ? theme.primaryContrast : theme.textPrimary}
          />
        </Pressable>
        <Pressable
          testID="composer-attach-button"
          onPress={onOpenAttachments}
          accessibilityRole="button"
          accessibilityLabel={t('chat.composer.a11y.open_attachments')}
          accessibilityHint={t('chat.composer.a11y.open_attachments_hint')}
          style={[
            styles.iconButton,
            { backgroundColor: theme.surface, borderColor: theme.cardBorder },
          ]}
          hitSlop={6}
        >
          <Ionicons name="add-circle-outline" size={22} color={theme.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.inputWrap}>
        <ChatInput
          value={text}
          onChangeText={onChangeText}
          onSend={onSend}
          isSending={isSending}
          disabled={disabled}
          imageUri={imageUri}
          onClearImage={onClearImage}
        />
      </View>

      {hasAudio ? (
        <Pressable
          testID="composer-audio-pill"
          onPress={onOpenAttachments}
          accessibilityRole="button"
          accessibilityLabel={t('chat.composer.a11y.audio_pill')}
          style={[styles.audioPill, { backgroundColor: theme.primary }]}
          hitSlop={6}
        >
          <Ionicons name="musical-notes" size={14} color={theme.primaryContrast} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: semantic.chat.gap,
    marginTop: semantic.screen.gapSmall,
  },
  leadingColumn: {
    flexDirection: 'column',
    gap: semantic.chat.gap,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  inputWrap: {
    flex: 1,
  },
  iconButton: {
    width: semantic.media.sendButtonSize,
    height: semantic.media.sendButtonSize,
    borderRadius: radius.full,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPill: {
    minWidth: 32,
    height: 32,
    borderRadius: radius.full,
    paddingHorizontal: space['2'],
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
