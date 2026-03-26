import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

/** Full-screen modal for previewing, rotating, and confirming an image before sending. */
export const ImagePreviewModal = ({
  imageUri,
  onConfirm,
  onCancel,
}: ImagePreviewModalProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [currentUri, setCurrentUri] = useState(imageUri);
  const { rotateImage, isProcessing } = useImageManipulation();

  // Sync with external imageUri changes
  useEffect(() => {
    if (imageUri !== null && !isProcessing) {
      setCurrentUri(imageUri);
    }
  }, [imageUri, isProcessing]);

  const handleRotate = useCallback(async () => {
    if (!currentUri || isProcessing) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const rotated = await rotateImage(currentUri);
    setCurrentUri(rotated);
  }, [currentUri, isProcessing, rotateImage]);

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
          <Pressable onPress={onCancel} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={theme.primaryContrast} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.primaryContrast }]}>{t('imagePreview.title')}</Text>
          <Pressable
            onPress={() => void handleRotate()}
            style={styles.headerButton}
            disabled={isProcessing}
          >
            <Ionicons
              name="refresh-outline"
              size={24}
              color={isProcessing ? theme.textSecondary : theme.primaryContrast}
            />
          </Pressable>
        </View>

        <View style={styles.imageContainer}>
          <Image
            source={{ uri: currentUri ?? undefined }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        <View style={styles.footer}>
          <Pressable onPress={onCancel} style={styles.cancelButton}>
            <Text style={[styles.cancelText, { color: theme.primaryContrast }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            style={styles.confirmButton}
            disabled={isProcessing}
          >
            <Ionicons name="send" size={18} color={theme.primaryContrast} />
            <Text style={[styles.confirmText, { color: theme.primaryContrast }]}>{t('common.send')}</Text>
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
    borderColor: 'rgba(255,255,255,0.3)',
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
    backgroundColor: '#1D4ED8',
  },
  confirmText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
