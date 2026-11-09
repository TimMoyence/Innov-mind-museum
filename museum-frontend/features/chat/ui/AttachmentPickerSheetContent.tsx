import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface AttachmentPickerSheetContentProps {
  readonly recordedAudioUri: string | null;
  readonly isPlayingAudio: boolean;
  readonly isRecording: boolean;
  readonly onPickImage: () => void;
  readonly onTakePicture: () => void;
  readonly toggleRecording: () => Promise<void> | void;
  readonly playRecordedAudio: () => Promise<void> | void;
  readonly clearMedia: () => void;
  readonly onOpenScanner: () => void;
  readonly onCompareImage?: () => void;
  readonly close: () => void;
}

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
  onCompareImage,
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
          <Text style={[styles.actionText, { color: theme.textPrimary }]} numberOfLines={2}>
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
          <Text style={[styles.actionText, { color: theme.textPrimary }]} numberOfLines={2}>
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
          <Text style={[styles.actionText, { color: theme.textPrimary }]} numberOfLines={2}>
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
          <Text style={[styles.actionText, { color: theme.textPrimary }]} numberOfLines={2}>
            {t('chat.attachmentPicker.scan_cartel')}
          </Text>
        </Pressable>

        {onCompareImage ? (
          <Pressable
            onPress={() => {
              onCompareImage();
              close();
            }}
            testID="attachment-picker-compare"
            accessibilityRole="button"
            accessibilityLabel={t('chat.attachmentPicker.compare')}
            style={[
              styles.actionButton,
              { borderColor: theme.cardBorder, backgroundColor: theme.surface },
            ]}
          >
            <Ionicons name="git-compare-outline" size={20} color={theme.textPrimary} />
            <Text style={[styles.actionText, { color: theme.textPrimary }]} numberOfLines={2}>
              {t('chat.attachmentPicker.compare')}
            </Text>
          </Pressable>
        ) : null}
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
    justifyContent: 'flex-start',
    gap: semantic.chat.gap,
  },
  actionButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexBasis: '30%',
    gap: semantic.chat.gapSmall,
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: space['3'],
    minHeight: 76,
  },
  actionText: {
    fontWeight: '600',
    fontSize: fontSize.sm,
    textAlign: 'center',
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
