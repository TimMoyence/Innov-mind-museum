import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

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
    marginTop: 10,
    padding: 10,
    gap: 8,
  },
  audioTitle: {
    fontWeight: '700',
    fontSize: 13,
  },
  audioRow: {
    flexDirection: 'row',
    gap: 8,
  },
  attachRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachText: {
    fontWeight: '600',
  },
});
