import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePickerLib from 'expo-image-picker';

import { optimizeImageAdaptive } from './imageUploadOptimization';
import { decideCompression, resolveCompressionMode } from './compressionDecision.pure';
import { useDataMode } from './DataModeProvider';

interface PhotoSource {
  requestPermission: () => Promise<{ status: string }>;
  launch: (options: ImagePickerLib.ImagePickerOptions) => Promise<ImagePickerLib.ImagePickerResult>;
  deniedTitleKey: 'permissions.galleryTitle' | 'permissions.cameraTitle';
  deniedMessageKey: 'permissions.galleryMessage' | 'permissions.cameraMessage';
}

const isGranted = ({ status }: { status: string }): boolean => status === 'granted';

const GALLERY: PhotoSource = {
  requestPermission: () => ImagePickerLib.requestMediaLibraryPermissionsAsync(),
  launch: (options) => ImagePickerLib.launchImageLibraryAsync(options),
  deniedTitleKey: 'permissions.galleryTitle',
  deniedMessageKey: 'permissions.galleryMessage',
};

const CAMERA: PhotoSource = {
  requestPermission: () => ImagePickerLib.requestCameraPermissionsAsync(),
  launch: (options) => ImagePickerLib.launchCameraAsync(options),
  deniedTitleKey: 'permissions.cameraTitle',
  deniedMessageKey: 'permissions.cameraMessage',
};

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

  const pickWith = useCallback(
    async (source: PhotoSource) => {
      if (!isGranted(await source.requestPermission())) {
        Alert.alert(t(source.deniedTitleKey), t(source.deniedMessageKey), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.settings'), onPress: () => void Linking.openSettings() },
        ]);
        return;
      }

      let result;
      try {
        result = await source.launch({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.8,
        });
      } catch {
        return;
      }

      if (!result.canceled) {
        const firstAsset = result.assets[0];
        if (firstAsset) await setOptimizedImage(firstAsset.uri);
      }
    },
    [setOptimizedImage, t],
  );

  const onPickImage = useCallback(() => pickWith(GALLERY), [pickWith]);

  const onTakePicture = useCallback(() => pickWith(CAMERA), [pickWith]);

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
