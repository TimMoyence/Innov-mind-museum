/* eslint-disable react-native/no-color-literals -- intentional dark overlay */
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useImageManipulation } from '@/features/chat/application/useImageManipulation';
import { useTheme } from '@/shared/ui/ThemeContext';

interface ImagePreviewModalProps {
  /** URI of the image to preview. `null` hides the modal. */
  imageUri: string | null;
  /** Called when the user confirms the (optionally edited) image. */
  onConfirm: (uri: string) => void;
  /** Called when the user dismisses the preview. */
  onCancel: () => void;
}

/** Full-screen modal for previewing, rotating, cropping, and confirming an image before sending. */
export const ImagePreviewModal = ({ imageUri, onConfirm, onCancel }: ImagePreviewModalProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [currentUri, setCurrentUri] = useState(imageUri);
  const { rotateImage, cropImage, isProcessing } = useImageManipulation();

  // Sync with external imageUri changes
  useEffect(() => {
    if (imageUri !== null && !isProcessing) {
      // eslint-disable-next-line -- prop sync requires setState in effect
      setCurrentUri(imageUri);
    }
  }, [imageUri, isProcessing]);

  const handleRotate = useCallback(async () => {
    if (!currentUri || isProcessing) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const rotated = await rotateImage(currentUri);
    setCurrentUri(rotated);
  }, [currentUri, isProcessing, rotateImage]);

  const handleCrop = useCallback(async () => {
    if (!currentUri || isProcessing) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(
        currentUri,
        (w, h) => {
          resolve({ width: w, height: h });
        },
        reject,
      );
    });
    const side = Math.min(size.width, size.height);
    const originX = Math.round((size.width - side) / 2);
    const originY = Math.round((size.height - side) / 2);
    const cropped = await cropImage(currentUri, { originX, originY, width: side, height: side });
    setCurrentUri(cropped);
  }, [currentUri, isProcessing, cropImage]);

  const handleConfirm = useCallback(() => {
    if (!currentUri) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm(currentUri);
  }, [currentUri, onConfirm]);

  if (!imageUri) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Pressable
            onPress={onCancel}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={24} color={theme.primaryContrast} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.primaryContrast }]}>
            {t('imagePreview.title')}
          </Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => void handleCrop()}
              style={styles.headerButton}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel={t('imagePreview.crop' as 'common.close')}
              accessibilityState={{ disabled: isProcessing }}
            >
              <Ionicons
                name="crop-outline"
                size={24}
                color={isProcessing ? theme.textSecondary : theme.primaryContrast}
              />
            </Pressable>
            <Pressable
              onPress={() => void handleRotate()}
              style={styles.headerButton}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel={t('imagePreview.rotate' as 'common.close')}
              accessibilityState={{ disabled: isProcessing }}
            >
              <Ionicons
                name="refresh-outline"
                size={24}
                color={isProcessing ? theme.textSecondary : theme.primaryContrast}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.imageContainer}>
          <Image
            source={{ uri: currentUri ?? undefined }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={t('imagePreview.title')}
            accessibilityRole="image"
          />
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={onCancel}
            style={[styles.cancelButton, { borderColor: theme.glassBorder }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Text style={[styles.cancelText, { color: theme.primaryContrast }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            style={[styles.confirmButton, { backgroundColor: theme.primary }]}
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={t('common.send')}
            accessibilityState={{ disabled: isProcessing }}
          >
            <Ionicons name="send" size={18} color={theme.primaryContrast} />
            <Text style={[styles.confirmText, { color: theme.primaryContrast }]}>
              {t('common.send')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancelText: {
    fontWeight: '600',
    fontSize: 15,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: undefined,
  },
  confirmText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
