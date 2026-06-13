import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePickerLib from 'expo-image-picker';

import { optimizeImageAdaptive } from './imageUploadOptimization';
import { decideCompression, resolveCompressionMode } from './compressionDecision.pure';
import { useDataMode } from './DataModeProvider';

/**
 * Hook that manages image selection state and handlers for chat attachments.
 * Supports gallery picking and native camera capture.
 * After selection, the image goes directly to `selectedImage` (no pending/confirm step).
 */
export const useImagePicker = () => {
  const { t } = useTranslation();
  const { resolved, preference, metered } = useDataMode();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const setOptimizedImage = useCallback(
    async (uri: string) => {
      // WebP is the preferred weak-network codec; the optimizer retries JPEG at
      // runtime if a platform rejects the encode, so we request it optimistically.
      // D-06: aggressive iff quality is low OR (pref 'auto' AND metered) —
      // upload volume is a COST decision (INV-02, US-02.3).
      const decision = decideCompression(
        resolveCompressionMode({ resolved, preference, metered }),
        true,
      );
      try {
        const { uploadUri } = await optimizeImageAdaptive(uri, decision);
        setSelectedImage(uploadUri);
      } catch {
        // Keep upload flow functional even if local optimization fails.
        setSelectedImage(uri);
      }
    },
    [resolved, preference, metered],
  );

  const onPickImage = useCallback(async () => {
    const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- expo-image-picker returns string-typed status from permission APIs
    if (status !== 'granted') {
      Alert.alert(t('permissions.galleryTitle'), t('permissions.galleryMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.settings'), onPress: () => void Linking.openSettings() },
      ]);
      return;
    }

    let result;
    try {
      result = await ImagePickerLib.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
    } catch {
      return; // Picker failed or was cancelled abnormally
    }

    if (!result.canceled) {
      const firstAsset = result.assets[0];
      if (firstAsset) await setOptimizedImage(firstAsset.uri);
    }
  }, [setOptimizedImage, t]);

  const onTakePicture = useCallback(async () => {
    const { status } = await ImagePickerLib.requestCameraPermissionsAsync();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- expo-image-picker returns string-typed status from permission APIs
    if (status !== 'granted') {
      Alert.alert(t('permissions.cameraTitle'), t('permissions.cameraMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.settings'), onPress: () => void Linking.openSettings() },
      ]);
      return;
    }

    let result;
    try {
      result = await ImagePickerLib.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
    } catch {
      return; // Picker failed or was cancelled abnormally
    }

    if (!result.canceled) {
      const firstAsset = result.assets[0];
      if (firstAsset) await setOptimizedImage(firstAsset.uri);
    }
  }, [setOptimizedImage, t]);

  const clearSelectedImage = useCallback(() => {
    setSelectedImage(null);
  }, []);

  return {
    selectedImage,
    onPickImage,
    onTakePicture,
    clearSelectedImage,
  };
};
