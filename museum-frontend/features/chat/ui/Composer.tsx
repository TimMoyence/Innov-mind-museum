import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ChatInput } from '@/features/chat/ui/ChatInput';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, radius, space } from '@/shared/ui/tokens';

interface ComposerProps {
  /** Current text value forwarded to the embedded <ChatInput>. */
  readonly text: string;
  /** Text change handler forwarded to the embedded <ChatInput>. */
  readonly onChangeText: (text: string) => void;
  /** Send handler forwarded to the embedded <ChatInput>. */
  readonly onSend: () => void;
  /** In-flight flag forwarded to the embedded <ChatInput>. */
  readonly isSending: boolean;
  /** Disabled flag forwarded to the embedded <ChatInput>. */
  readonly disabled?: boolean;
  /** URI of the attached image thumbnail forwarded to <ChatInput>. */
  readonly imageUri?: string | null;
  /** Clear-image handler forwarded to <ChatInput>. */
  readonly onClearImage?: () => void;
  /** Audio recorder state — drives the optional mini-pill and mic icon. */
  readonly recordedAudioUri: string | null;
  /** Recording state — flips the mic icon + accessibility busy state. */
  readonly isRecording: boolean;
  /** Tap-to-toggle the recording session. Wrapped by the screen behind the EU AI Act voice gate. */
  readonly toggleRecording: () => Promise<void> | void;
  /** Opens the `attachment-picker` bottom sheet route (C4 router). */
  readonly onOpenAttachments: () => void;
}

/**
 * Unified composer (A1) — minimalist 1-line surface that hosts the leading
 * vertical column (mic stacked above `+`), the existing `<ChatInput>` building
 * block (text + send), and an optional audio mini-pill when an audio message
 * has been recorded.
 *
 * Doctrine reuse: `<ChatInput>` is consumed as-is (R7 — non-regression). The
 * row introduces no new container token, no animation, no internal state. The
 * EU AI Act gate is preserved upstream via the screen's wrapped
 * `toggleRecording` (the composer receives the wrapped version).
 *
 * a11y: all a11y props live on the `<Pressable>` per
 * `lib-docs/react-native/PATTERNS.md` §7. No `accessibilityRole='button'` on
 * any inner View — VoiceOver / TalkBack discover the surrounding Pressable
 * only, no double-announce.
 */
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
