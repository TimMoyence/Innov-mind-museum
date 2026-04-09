import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius } from '@/shared/ui/tokens';

interface MediaAttachmentPanelProps {
  // Audio preview
  recordedAudioUri: string | null;
  isPlayingAudio: boolean;
  isRecording: boolean;
  playRecordedAudio: () => Promise<void>;
  clearMedia: () => void;
  // Attach actions
  onPickImage: () => void;
  onTakePicture: () => void;
  toggleRecording: () => Promise<void>;
}

/** Audio preview area and gallery/lens/audio attachment buttons. */
export function MediaAttachmentPanel({
  recordedAudioUri,
  isPlayingAudio,
  isRecording,
  playRecordedAudio,
  clearMedia,
  onPickImage,
  onTakePicture,
  toggleRecording,
}: MediaAttachmentPanelProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <>
      {recordedAudioUri ? (
        <GlassCard style={styles.audioCard} intensity={56}>
          <Text style={[styles.audioTitle, { color: theme.textPrimary }]}>
            {t('chat.voice_ready')}
          </Text>
          <View style={styles.audioRow}>
            <Pressable
              style={[
                styles.attachButton,
                { borderColor: theme.cardBorder, backgroundColor: theme.surface },
              ]}
              onPress={() => void playRecordedAudio()}
              disabled={isPlayingAudio}
              accessibilityRole="button"
              accessibilityLabel={isPlayingAudio ? t('chat.playing') : t('chat.play')}
            >
              <Text style={[styles.attachText, { color: theme.textPrimary }]}>
                {isPlayingAudio ? t('chat.playing') : t('chat.play')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.attachButton,
                { borderColor: theme.cardBorder, backgroundColor: theme.surface },
              ]}
              onPress={clearMedia}
              accessibilityRole="button"
              accessibilityLabel={t('chat.clear')}
            >
              <Text style={[styles.attachText, { color: theme.textPrimary }]}>
                {t('chat.clear')}
              </Text>
            </Pressable>
          </View>
        </GlassCard>
      ) : null}

      <View style={styles.attachRow}>
        <Pressable
          style={[
            styles.attachButton,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => {
            onPickImage();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('chat.gallery')}
        >
          <Ionicons name="images-outline" size={16} color={theme.textPrimary} />
          <Text style={[styles.attachText, { color: theme.textPrimary }]}>{t('chat.gallery')}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.attachButton,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => {
            onTakePicture();
          }}
          testID="camera-button"
          accessibilityRole="button"
          accessibilityLabel={t('chat.lens')}
        >
          <Ionicons name="camera-outline" size={16} color={theme.textPrimary} />
          <Text style={[styles.attachText, { color: theme.textPrimary }]}>{t('chat.lens')}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.attachButton,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => void toggleRecording()}
          testID="record-button"
          accessibilityRole="button"
          accessibilityLabel={isRecording ? t('chat.stop_audio') : t('chat.audio')}
        >
          <Ionicons
            name={isRecording ? 'stop-circle-outline' : 'mic-outline'}
            size={16}
            color={theme.textPrimary}
          />
          <Text style={[styles.attachText, { color: theme.textPrimary }]}>
            {isRecording ? t('chat.stop_audio') : t('chat.audio')}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  audioCard: {
    marginTop: space['2.5'],
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
  attachRow: {
    flexDirection: 'row',
    gap: semantic.chat.gap,
    marginTop: space['2.5'],
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gapSmall,
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: space['2.5'],
  },
  attachText: {
    fontWeight: '600',
  },
});
