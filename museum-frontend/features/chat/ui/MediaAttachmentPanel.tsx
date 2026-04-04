import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

interface MediaAttachmentPanelProps {
  // Image preview
  selectedImage: string | null;
  onPickImage: () => void;
  clearSelectedImage: () => void;
  // Audio preview
  recordedAudioUri: string | null;
  isPlayingAudio: boolean;
  isRecording: boolean;
  playRecordedAudio: () => Promise<void>;
  clearMedia: () => void;
  // Attach actions
  onTakePicture: () => void;
  toggleRecording: () => Promise<void>;
}

/** Image/audio preview area and gallery/lens/audio attachment buttons. */
export function MediaAttachmentPanel({
  selectedImage,
  onPickImage,
  clearSelectedImage,
  recordedAudioUri,
  isPlayingAudio,
  isRecording,
  playRecordedAudio,
  clearMedia,
  onTakePicture,
  toggleRecording,
}: MediaAttachmentPanelProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <>
      {selectedImage ? (
        <View style={styles.previewWrap}>
          <Image
            source={{ uri: selectedImage }}
            style={[styles.preview, { borderColor: theme.inputBorder }]}
          />
          <View style={styles.previewMenu}>
            <FloatingContextMenu
              actions={[
                {
                  id: 'replace',
                  icon: 'images-outline',
                  label: t('chat.replace_image'),
                  onPress: () => {
                    onPickImage();
                  },
                },
                {
                  id: 'clear-image',
                  icon: 'trash-outline',
                  label: t('chat.remove_image'),
                  onPress: clearSelectedImage,
                },
              ]}
            />
          </View>
        </View>
      ) : null}

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
  previewWrap: {
    marginTop: 8,
  },
  preview: {
    width: 100,
    height: 100,
    borderRadius: 14,
    borderWidth: 1,
  },
  previewMenu: {
    marginTop: 6,
  },
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
