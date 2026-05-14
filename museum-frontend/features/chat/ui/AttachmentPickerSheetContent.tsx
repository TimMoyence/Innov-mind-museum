import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface AttachmentPickerSheetContentProps {
  /** Audio recorder state — drives the preview block visibility. */
  readonly recordedAudioUri: string | null;
  /** Audio playback state — flips the play button label. */
  readonly isPlayingAudio: boolean;
  /** Recording state — flips the record action between record/stop. */
  readonly isRecording: boolean;
  /** Open the system gallery picker. Closes the sheet. */
  readonly onPickImage: () => void;
  /** Open the camera capture flow. Closes the sheet. */
  readonly onTakePicture: () => void;
  /**
   * Toggle the audio recording session (wrapped upstream behind the EU AI
   * Act voice gate). The sheet stays open so the user gets visual feedback.
   */
  readonly toggleRecording: () => Promise<void> | void;
  /** Play the recorded audio preview. The sheet stays open. */
  readonly playRecordedAudio: () => Promise<void> | void;
  /** Clear all attached media (audio + image). Closes the sheet. */
  readonly clearMedia: () => void;
  /**
   * Open the QR-cartel scanner (B4 — 9th C4 route `cartel-scanner`). The
   * screen wires it to `bottomSheetRouter.open('cartel-scanner', ...)`. The
   * picker sheet closes itself when the user taps the action.
   */
  readonly onOpenScanner: () => void;
  /** Dismiss the bottom sheet — supplied by the C4 router. */
  readonly close: () => void;
}

/**
 * Bottom-sheet content (slide-up presentation) hosting the chat attachment
 * actions: camera, gallery, record-audio, plus an inline audio preview block
 * (play / clear) when an audio message has been recorded. Mounted by the C4
 * `<BottomSheetRouter>` for the `attachment-picker` route (A1 — 8th route).
 *
 * Doctrine: keeps the user-facing copy from the legacy `<MediaAttachmentPanel>`
 * audio block (`chat.voice_ready` / `chat.play` / `chat.playing` / `chat.clear`)
 * for parity, surfaces the new picker labels under `chat.attachmentPicker.*`.
 *
 * Spec: docs/chat-ux-refonte/specs/A1.md §1.3, §2.4.
 */
export function AttachmentPickerSheetContent({
  recordedAudioUri,
  isPlayingAudio,
  isRecording,
  onPickImage,
  onTakePicture,
  toggleRecording,
  playRecordedAudio,
  clearMedia,
  onOpenScanner,
  close,
}: AttachmentPickerSheetContentProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const hasAudio = recordedAudioUri !== null;

  return (
    <View style={styles.root}>
      <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
        {t('chat.attachmentPicker.title')}
      </Text>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={() => {
            onTakePicture();
            close();
          }}
          testID="attachment-picker-camera"
          accessibilityRole="button"
          accessibilityLabel={t('chat.attachmentPicker.camera')}
          style={[
            styles.actionButton,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
        >
          <Ionicons name="camera-outline" size={20} color={theme.textPrimary} />
          <Text style={[styles.actionText, { color: theme.textPrimary }]}>
            {t('chat.attachmentPicker.camera')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            onPickImage();
            close();
          }}
          testID="attachment-picker-gallery"
          accessibilityRole="button"
          accessibilityLabel={t('chat.attachmentPicker.gallery')}
          style={[
            styles.actionButton,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
        >
          <Ionicons name="images-outline" size={20} color={theme.textPrimary} />
          <Text style={[styles.actionText, { color: theme.textPrimary }]}>
            {t('chat.attachmentPicker.gallery')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void toggleRecording()}
          testID="attachment-picker-record"
          accessibilityRole="button"
          accessibilityLabel={
            isRecording
              ? t('chat.attachmentPicker.stop_audio')
              : t('chat.attachmentPicker.record_audio')
          }
          accessibilityState={{ busy: isRecording }}
          style={[
            styles.actionButton,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
        >
          <Ionicons
            name={isRecording ? 'stop-circle-outline' : 'mic-outline'}
            size={20}
            color={theme.textPrimary}
          />
          <Text style={[styles.actionText, { color: theme.textPrimary }]}>
            {isRecording
              ? t('chat.attachmentPicker.stop_audio')
              : t('chat.attachmentPicker.record_audio')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            onOpenScanner();
            close();
          }}
          testID="attachment-picker-scan-cartel"
          accessibilityRole="button"
          accessibilityLabel={t('chat.attachmentPicker.scan_cartel')}
          style={[
            styles.actionButton,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
        >
          <Ionicons name="qr-code-outline" size={20} color={theme.textPrimary} />
          <Text style={[styles.actionText, { color: theme.textPrimary }]}>
            {t('chat.attachmentPicker.scan_cartel')}
          </Text>
        </Pressable>
      </View>

      {hasAudio ? (
        <GlassCard style={styles.audioCard} intensity={56}>
          <Text style={[styles.audioTitle, { color: theme.textPrimary }]}>
            {t('chat.voice_ready')}
          </Text>
          <View style={styles.audioRow}>
            <Pressable
              onPress={() => void playRecordedAudio()}
              disabled={isPlayingAudio}
              accessibilityRole="button"
              accessibilityLabel={isPlayingAudio ? t('chat.playing') : t('chat.play')}
              style={[
                styles.smallButton,
                { borderColor: theme.cardBorder, backgroundColor: theme.surface },
              ]}
            >
              <Text style={[styles.smallText, { color: theme.textPrimary }]}>
                {isPlayingAudio ? t('chat.playing') : t('chat.play')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                clearMedia();
                close();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.clear')}
              style={[
                styles.smallButton,
                { borderColor: theme.cardBorder, backgroundColor: theme.surface },
              ]}
            >
              <Text style={[styles.smallText, { color: theme.textPrimary }]}>
                {t('chat.clear')}
              </Text>
            </Pressable>
          </View>
        </GlassCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: semantic.screen.padding,
    paddingTop: space['3'],
    paddingBottom: semantic.modal.padding,
    gap: semantic.section.gapSmall,
  },
  title: {
    fontSize: semantic.card.titleSize,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: semantic.chat.gap,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gapSmall,
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: space['2.5'],
    minHeight: 44,
  },
  actionText: {
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
  audioCard: {
    padding: space['2.5'],
    gap: semantic.chat.gap,
  },
  audioTitle: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
  audioRow: {
    flexDirection: 'row',
    gap: semantic.chat.gap,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gapSmall,
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: space['2.5'],
  },
  smallText: {
    fontWeight: '600',
  },
});
